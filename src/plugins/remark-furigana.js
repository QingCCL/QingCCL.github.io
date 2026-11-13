import { visit } from "unist-util-visit";

/**
 * Remark 插件：给日语汉字标读音（振り仮名），渲染成 <ruby>，默认不显示，鼠标悬停才浮出来。
 *
 * 写法：
 *
 *   帰る[かえる]
 *   この漢字[かんじ]と大阪[おおさか]
 *
 * 方括号里必须是平假名（可带长音符 ー、中点 ・）。不含平假名的 [..] 一律原样保留，
 * 所以普通方括号文本、markdown 链接都不会被误伤。
 *
 * 注音的起点按「最后一个汉字串 + 其后的送假名」来截：
 *
 *   「この漢字[かんじ]」 → この + ruby(漢字/かんじ)，不会把「この」也框进去
 *   「食べる[たべる]」   → ruby(食べる/たべる)
 *   「お湯[おゆ]」       → 汤前面的词尾带汤，截不到「お」，这种情况不转换，原样显示
 *
 * 为什么不干脆用「汉字开头 + 非贪婪」：那样「この漢字」会先试「漢」再失败，最后从
 * 「字」开始匹配，把读音对错词。从匹配结果尾部截，才能保证读音和 base 严格对应。
 *
 * Why 两步：`帰る[かえる]` 里的 `[かえる]` 会被 markdown 解析成一个未定义的
 * linkReference（CommonMark 的 shortcut reference 写法），渲染时方括号会留在页面上。
 * 所以第一步先把"纯假名的 shortcut reference"还原成普通文本，第二步才做替换。
 *
 * @returns {import('unified').Plugin}
 */

// 平假名（读音只能用它，避免 `[テキスト]` 这类方括号标记被误判成注音）
const HIRA = "\\p{Script=Hiragana}ー・";
// 汉字，含 々（人々）、〆、ヶ（一ヶ月）
const HAN = "\\p{Script=Han}々〆ヶ";

// 宽松匹配：任意非空白、非括号的串 + [平假名]。起点在这里不重要，后面还会截。
const FURI_PATTERN = new RegExp(
	`([^\\s\\[\\]()（）「」<>{}]+?)\\[([${HIRA}]+)\\]`,
	"gu",
);

// 从 base 尾部截出「最后一个连续汉字串 + 其后的送假名」
const BASE_TAIL = new RegExp(`[${HAN}]+[${HIRA}]*$`, "u");

// 纯平假名的 label 才是我们还原的目标
const KANA_ONLY = new RegExp(`^[${HIRA}]+$`, "u");

/**
 * 构造 ruby 节点。
 *
 * mdast 没有原生 ruby 类型，借一个 inline 容器（emphasis）占位，
 * 用 data.hName / data.hChildren 让 mdast-util-to-hast 直接输出
 * <ruby class="furi">base<rt>reading</rt></ruby>。
 */
function makeRuby(base, reading) {
	return {
		type: "emphasis",
		data: {
			hName: "ruby",
			hProperties: { className: ["furi"] },
			hChildren: [
				{ type: "text", value: base },
				{
					type: "element",
					tagName: "rt",
					properties: {},
					children: [{ type: "text", value: reading }],
				},
			],
		},
		children: [],
	};
}

/** 按 FURI_PATTERN 把一段文本切成 text / ruby 混合节点，没有可用匹配就返回 null。 */
function splitFurigana(value) {
	FURI_PATTERN.lastIndex = 0;

	const out = [];
	let lastIndex = 0;
	let match = FURI_PATTERN.exec(value);

	while (match) {
		const rawBase = match[1];
		let reading = match[2];
		const tail = BASE_TAIL.exec(rawBase);

		// 截不到汉字说明这里不是注音写法（比如纯假名后面跟方括号），原样跳过
		if (!tail) {
			match = FURI_PATTERN.exec(value);
			continue;
		}

		const base = tail[0];
		const prefix = rawBase.slice(0, rawBase.length - base.length);

		// 「お金[おかね]」这种接头词：读音是整词的，把开头那个「お／ご」还给前缀。
		// 只看前缀的最后一个字，因为前缀里可能还带着标点或前文（「面：お金」）。
		const lastChar = prefix.slice(-1);
		if ((lastChar === "お" || lastChar === "ご") && reading.startsWith(lastChar)) {
			reading = reading.slice(1);
		}
		if (!reading) {
			match = FURI_PATTERN.exec(value);
			continue;
		}

		if (match.index > lastIndex) {
			out.push({
				type: "text",
				value: value.slice(lastIndex, match.index),
			});
		}
		if (prefix) {
			out.push({ type: "text", value: prefix });
		}
		out.push(makeRuby(base, reading));

		lastIndex = match.index + match[0].length;
		match = FURI_PATTERN.exec(value);
	}

	if (out.length === 0) {
		return null;
	}
	if (lastIndex < value.length) {
		out.push({ type: "text", value: value.slice(lastIndex) });
	}
	return out;
}

export function remarkFurigana() {
	return (tree) => {
		// 步骤一：把 `[かえる]` 这种纯假名、未定义的 shortcut reference 还原成文本。
		// 真实 markdown 里 `帰る[かえる]` 会被切成 text("帰る") + linkReference("[かえる]")，
		// 所以还原时要跟前一个 text 节点拼回去，否则正则跨不过节点边界。
		visit(tree, "linkReference", (node, index, parent) => {
			if (!parent || typeof index !== "number") {
				return;
			}
			if (node.referenceType !== "shortcut") {
				return;
			}
			const label = node.label ?? "";
			if (!KANA_ONLY.test(label)) {
				return;
			}

			const prev = parent.children[index - 1];
			if (prev && prev.type === "text") {
				prev.value += `[${label}]`;
				parent.children.splice(index, 1);
				return index - 1;
			}

			parent.children[index] = { type: "text", value: `[${label}]` };
			return index;
		});

		// 步骤二：拆 text 节点
		visit(tree, "text", (node, index, parent) => {
			if (!parent || typeof index !== "number") {
				return;
			}
			if (!node.value.includes("[")) {
				return;
			}

			const nodes = splitFurigana(node.value);
			if (!nodes) {
				return;
			}

			parent.children.splice(index, 1, ...nodes);
			return index + nodes.length - 1;
		});
	};
}
