import { Component, MarkdownRenderer } from 'obsidian';

export async function renderMarkdownContent(markdown: string, container: HTMLElement, sourcePath = ''): Promise<Component> {
	container.empty();
	const component = new Component();
	await MarkdownRenderer.render(markdown, container, sourcePath, component);
	component.load();
	return component;
}
