/**
 * Lightweight markdown to HTML converter
 * @module markdown
 */

/**
 * Escapes HTML special characters.
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
export const escapeHtml = (text) => {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
};

/**
 * Processes fenced code blocks.
 * @param {string} markdown - Markdown content
 * @returns {string} HTML with code blocks
 */
const processCodeBlocks = (markdown) => {
	return markdown.replace(/```(\w*)\n([\s\S]*?)```/g, (_, language, code) => {
		const langClass = language ? ` class="language-${language}"` : "";
		return `<pre><code${langClass}>${escapeHtml(code.trim())}</code></pre>`;
	});
};

/**
 * Processes markdown tables.
 * @param {string} markdown - Markdown content
 * @returns {string} HTML with tables
 */
const processTables = (markdown) => {
	const tableRegex = /^\|(.+)\|\n\|[\s:-]+\|\n((?:\|.+\|\n?)+)/gm;

	return markdown.replace(tableRegex, (_, headerRow, bodyRows) => {
		const headers = headerRow
			.split("|")
			.map((cell) => cell.trim())
			.filter(Boolean);
		const rows = bodyRows
			.trim()
			.split("\n")
			.map((row) =>
				row
					.split("|")
					.map((cell) => cell.trim())
					.filter(Boolean),
			);

		const headerHtml = headers.map((h) => `<th>${h}</th>`).join("");
		const bodyHtml = rows
			.map(
				(row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`,
			)
			.join("\n");

		return `<table>\n<thead><tr>${headerHtml}</tr></thead>\n<tbody>\n${bodyHtml}\n</tbody>\n</table>`;
	});
};

/**
 * Processes markdown lists (unordered and ordered).
 * @param {string} markdown - Markdown content
 * @returns {string} HTML with lists
 */
const processLists = (markdown) => {
	let result = markdown;

	// Unordered lists
	result = result.replace(/(?:^|\n)((?:[-*+]\s+.+\n?)+)/g, (_, listContent) => {
		const items = listContent
			.trim()
			.split(/\n/)
			.map((item) => item.replace(/^[-*+]\s+/, "").trim())
			.map((item) => `<li>${item}</li>`)
			.join("\n");
		return `\n<ul>\n${items}\n</ul>\n`;
	});

	// Ordered lists
	result = result.replace(/(?:^|\n)((?:\d+\.\s+.+\n?)+)/g, (_, listContent) => {
		const items = listContent
			.trim()
			.split(/\n/)
			.map((item) => item.replace(/^\d+\.\s+/, "").trim())
			.map((item) => `<li>${item}</li>`)
			.join("\n");
		return `\n<ol>\n${items}\n</ol>\n`;
	});

	return result;
};

/**
 * Processes blockquotes.
 * @param {string} markdown - Markdown content
 * @returns {string} HTML with blockquotes
 */
const processBlockquotes = (markdown) => {
	return markdown.replace(/(?:^|\n)((?:>\s*.+\n?)+)/g, (_, quoteContent) => {
		const content = quoteContent
			.trim()
			.split(/\n/)
			.map((line) => line.replace(/^>\s*/, ""))
			.join("\n");
		return `\n<blockquote>${content}</blockquote>\n`;
	});
};

/**
 * Processes inline markdown elements.
 * @param {string} markdown - Markdown content
 * @returns {string} HTML with inline elements
 */
const processInlineElements = (markdown) => {
	let result = markdown;

	// Links: [text](url)
	result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

	// Images: ![alt](url)
	result = result.replace(
		/!\[([^\]]*)\]\(([^)]+)\)/g,
		'<img src="$2" alt="$1">',
	);

	// Bold: **text** or __text__
	result = result.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
	result = result.replace(/__([^_]+)__/g, "<strong>$1</strong>");

	// Italic: *text* or _text_
	result = result.replace(/\*([^*]+)\*/g, "<em>$1</em>");
	result = result.replace(/(?<![_\w])_([^_]+)_(?![_\w])/g, "<em>$1</em>");

	// Inline code: `code`
	result = result.replace(
		/`([^`]+)`/g,
		(_, code) => `<code>${escapeHtml(code)}</code>`,
	);

	// Strikethrough: ~~text~~
	result = result.replace(/~~([^~]+)~~/g, "<del>$1</del>");

	return result;
};

/**
 * Processes headers (h1-h6).
 * @param {string} markdown - Markdown content
 * @returns {string} HTML with headers
 */
const processHeaders = (markdown) => {
	let result = markdown;

	// ATX-style headers
	result = result.replace(/^#{6}\s+(.+)$/gm, "<h6>$1</h6>");
	result = result.replace(/^#{5}\s+(.+)$/gm, "<h5>$1</h5>");
	result = result.replace(/^#{4}\s+(.+)$/gm, "<h4>$1</h4>");
	result = result.replace(/^#{3}\s+(.+)$/gm, "<h3>$1</h3>");
	result = result.replace(/^#{2}\s+(.+)$/gm, "<h2>$1</h2>");
	result = result.replace(/^#{1}\s+(.+)$/gm, "<h1>$1</h1>");

	return result;
};

/**
 * Processes horizontal rules.
 * @param {string} markdown - Markdown content
 * @returns {string} HTML with horizontal rules
 */
const processHorizontalRules = (markdown) => {
	return markdown.replace(/^(?:[-*_]){3,}\s*$/gm, "<hr>");
};

/**
 * Wraps remaining text in paragraphs.
 * @param {string} html - HTML content
 * @returns {string} HTML with paragraphs
 */
const wrapParagraphs = (html) => {
	const blocks = html.split(/\n\n+/);
	const blockTags =
		/^<(h[1-6]|p|ul|ol|li|blockquote|pre|table|thead|tbody|tr|th|td|hr|div)/;

	return blocks
		.map((block) => {
			const trimmed = block.trim();
			if (!trimmed) return "";
			if (blockTags.test(trimmed)) return trimmed;
			return `<p>${trimmed.replace(/\n/g, "<br>")}</p>`;
		})
		.filter(Boolean)
		.join("\n\n");
};

/**
 * Converts markdown to HTML.
 * @param {string} markdown - Markdown content
 * @returns {string} HTML content
 */
export const markdownToHtml = (markdown) => {
	if (!markdown || typeof markdown !== "string") return "";

	let html = markdown;

	// Process block elements first (order matters)
	html = processCodeBlocks(html);
	html = processTables(html);
	html = processBlockquotes(html);
	html = processLists(html);
	html = processHorizontalRules(html);
	html = processHeaders(html);

	// Process inline elements
	html = processInlineElements(html);

	// Wrap remaining text in paragraphs
	html = wrapParagraphs(html);

	return html;
};

/**
 * Extracts the first heading from markdown as a title.
 * @param {string} markdown - Markdown content
 * @returns {string|null} First heading text or null
 */
export const extractTitle = (markdown) => {
	const match = markdown.match(/^#{1,6}\s+(.+)$/m);
	return match ? match[1].trim() : null;
};

/**
 * Extracts all headings from markdown with their levels.
 * @param {string} markdown - Markdown content
 * @returns {{ level: number, text: string, id: string }[]} Array of headings
 */
export const extractHeadings = (markdown) => {
	const headings = [];
	const headingRegex = /^(#{1,6})\s+(.+)$/gm;
	const matches = markdown.matchAll(headingRegex);

	for (const match of matches) {
		const level = match[1].length;
		const text = match[2].trim();
		const id = text
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/^-|-$/g, "");
		headings.push({ level, text, id });
	}

	return headings;
};
