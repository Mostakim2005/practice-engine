import { App, PluginSettingTab, Setting } from 'obsidian';
import type PracticePlugin from './main';
export interface PracticePluginSettings{questionBankPath:string;}
export const DEFAULT_SETTINGS:PracticePluginSettings={questionBankPath:'_Practice/Question Banks/question-bank.json'};
// eslint-disable-next-line obsidianmd/settings-tab/prefer-setting-definitions
export class PracticeSettingTab extends PluginSettingTab{constructor(app:App,private readonly plugin:PracticePlugin){super(app,plugin);}display():void{const e=this.containerEl;e.empty();new Setting(e).setName('Question bank path').setDesc('Phase 1 uses the default path. A configurable path will be added later.').addText(t=>t.setValue(this.plugin.settings.questionBankPath).setDisabled(true));}}
