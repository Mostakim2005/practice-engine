import { App, Component, MarkdownRenderer } from 'obsidian';

export async function renderMarkdownContent(
	app: App,
	markdown: string,
	container: HTMLElement,
	sourcePath = '',
): Promise<Component> {
	container.empty();
	const component = new Component();
	await MarkdownRenderer.render(app, markdown, container, sourcePath, component);
	component.load();
	return component;
}
