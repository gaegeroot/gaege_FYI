---
title: "My First Post"
description: "A short summary shown in the writing list and feed."
date: 2026-10-19
tags: ["astro", "notes"]
draft: true
---

This post is a reference for the Markdown you can write in an Astro post. Astro renders standard Markdown and GitHub Flavored Markdown (GFM); syntax that needs extra integrations, such as embedded Astro components or MDX, is not enabled here.

## Headings

Use `#` characters for headings. The page title is already an H1; these show the remaining heading levels:

### Heading level 3

#### Heading level 4

##### Heading level 5

###### Heading level 6

## Paragraphs and inline formatting

Separate paragraphs with a blank line. A single newline is normally treated as a space. Add a backslash at the end of a line for a hard line break:\
This starts on the next line.

Style text with *italics*, **bold**, or ***bold italics***. GFM also supports ~~strikethrough~~. Use `inline code` for short code samples, and escape Markdown characters with a backslash, like \*this\*.

## Links and images

Add an [inline link](https://astro.build/) or a [reference-style link][astro]. Bare URLs such as https://astro.build/ are automatically linked.

[astro]: https://astro.build/ "Astro"

![The site's G monogram favicon](/favicon.svg "Site monogram")

## Lists

Unordered lists use hyphens, plus signs, or asterisks:

- First item
- Second item
  - Nested item

Ordered lists use numbers:

1. First step
2. Second step
   1. Nested step

GFM task lists add checkboxes:

- [x] Published item
- [ ] Item still to do

## Blockquotes

> Use `>` to quote text.
>
> A blank quoted line separates paragraphs.
>
> > Add another `>` to nest a quote.

## Code

Use backticks for `inline code`. Fenced blocks can include a language name for syntax highlighting:

```js
const greeting = 'Hello, Markdown!';
console.log(greeting);
```

```diff
- Old wording
+ Updated wording
```

## Tables

GFM tables use pipes and a separator row. Colons control alignment:

| Left aligned | Centered | Right aligned |
| :--- | :---: | ---: |
| Markdown | Astro | Posts |
| Text | 123 | $4.50 |

## Other block formatting

Three hyphens make a thematic break:

---

Footnotes let you add a note without interrupting the paragraph.[^note]

[^note]: This is the footnote text. Footnotes are part of GFM.

Inline HTML is also allowed, for example a keyboard key: <kbd>Ctrl</kbd> + <kbd>C</kbd>.

<details>
<summary>Expandable details</summary>
<p>This uses an HTML details element. Use HTML when Markdown does not provide the element you need.</p>
</details>

## Post metadata

The YAML frontmatter at the top of this file supplies the title, description, date, tags, and draft status. A post marked `draft: true` is not included in the published writing pages.
