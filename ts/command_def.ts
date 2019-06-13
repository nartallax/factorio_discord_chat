/** Определение команды. Может быть как просто описанием действий, так и иметь какие-то дополнительные фичи */
export type CommandDefinition = Actions | CommandDefinitionWithAdditions;

/** описание команды с дополнительными фичами */
export interface CommandDefinitionWithAdditions {
	userList?: string | string[]; /** имя списка/списков пользователей, которым можно использовать эту команду. не передан = можно всем */
	description?: string; /** человекопонятное описание команды */
	actions: ActionDefinition[];
}

/** описание действий - может быть как одиночным действием, так и массивом действий
 * в случае массива действия выполняются последовательно */
export type Actions = ActionDefinition | ActionDefinition[];
/** Действие - строка или какое-либо более хитрое действие
 * в случае строки подразумевается, что она содержит команду, которую нужно исполнить на сервере */
export type ActionDefinition = string | ExtendedAction;

export type ExtendedAction = SleepAction | ServerCommandAction | RebootAction | DiscordMessageAction | ShellAction | WaitLineAction | StopAction | StartAction;

/** Действие: подождать, прежде чем переходить к следующему действию */
export interface SleepAction {
	sleep: number; 
}

/** Действие: исполнить команду на сервере. Команду можно читать из файла
 * Доступны {}-плейсхолдеры. Каждый плейсхолдер эскейпается так, как если бы он вставлялся в lua-строку
 * т.е. допустимо писать command: "print('Hello {nick}!')", потому что параметр nick эскейпнется корректно */
export type ServerCommandAction = ServerCommandLiteralAction | ServerCommandFileAction
export type ServerCommandLiteralAction = { command: string }
export type ServerCommandFileAction = { commandFile: string }

/** Действие: перезапустить сервер без перезапуска враппера */
export interface RebootAction {
	reboot: true
}

export interface StopAction { stop: true }
export interface StartAction { start: true }

/** Действие: сказать что-либо в дискорд. доступны {}-плейсхолдеры */
export interface DiscordMessageAction {
	discordMessage: string;
}

/** Действие: исполнить shell-команду. Команду можно читать из файла
 * в команде можно использовать {}-плейсхолдеры, но они НИКАК не эскейпаются, так что это не рекомендуется в общем случае
 * т.к. это угроза безопасности */
export type ShellAction = (ShellLiteralAction | ShellFileAction | ShellParametrizedAction)
export interface ShellActionFlags { stdoutToDiscord?: boolean; stderrToDiscord?: boolean, stdoutCodeWrap?: boolean, stderrCodeWrap?: boolean}
export interface ShellLiteralAction extends ShellActionFlags { shell: string }
export interface ShellFileAction extends ShellActionFlags { shellFile: string }
/** Исполнить некоторый файл, прокинув аргументы */
export interface ShellParametrizedAction extends ShellActionFlags { shellExec: string, args?: string[] }

/** Действие: подождать, пока сервер не выдаст линию с определенным содержанием в свой stdout */
export type WaitLineAction = WaitIncludeLineAction | WaitRegexpLineAction;
export interface WaitIncludeLineAction { waitLineIncludes: string }
export interface WaitRegexpLineAction { waitLineRegexp: string }
