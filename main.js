(function(packageCode, modname, runEval, entryPoint, entryFunction, waitLoad, onPackageNotFound){
	var knownPackages = {
		require: function(name){
			return onPackageNotFound(name);
		}
	}

	var currentPackage = null;
	var define = function(reqs, fn){
		var pkgs = [];
		var result = null;
		for(var i = 0; i < reqs.length; i++){
			var r = modname.resolve(currentPackage, reqs[i]);
			if(r === "exports")
				pkgs.push(result = {});
			else if(!(r in knownPackages))
				pkgs.push(onPackageNotFound(r))
			else
				pkgs.push(knownPackages[r]);
		}
		fn.apply(null, pkgs);
		knownPackages[currentPackage] = result;
	}
	
	var run = function(){
		for(var i = 0; i < packageCode.length; i++){
			var pkgName = packageCode[i][0];
			var pkgCode = packageCode[i][1] + "\n//# sourceURL=" + pkgName;
			currentPackage = pkgName;
			runEval(pkgCode, define);
			currentPackage = null;
		}
		knownPackages[entryPoint][entryFunction]();
	}
	
	waitLoad = waitLoad || function(cb){ cb() };
	waitLoad(run);
})([["utils","define([\"require\", \"exports\", \"fs\"], function (require, exports, fs) {\n    \"use strict\";\n    Object.defineProperty(exports, \"__esModule\", { value: true });\n    async function safetyWrap(action) {\n        try {\n            return await Promise.resolve(action());\n        }\n        catch (e) {\n            console.error(\"Wrapper failed: \" + e.stack);\n            return null;\n        }\n    }\n    exports.safetyWrap = safetyWrap;\n    function readTextFile(path) {\n        return new Promise((ok, bad) => {\n            fs.readFile(path, \"utf8\", (err, result) => err ? bad(err) : ok(result));\n        });\n    }\n    exports.readTextFile = readTextFile;\n    function luaEscapeString(str) {\n        return str.replace(/\\\\/g, \"\\\\\\\\\").replace(/'/g, \"\\\\'\").replace(/\"/g, '\\\\\"').replace(/\\n/g, \"\\\\n\").replace(/\\r/g, \"\");\n    }\n    exports.luaEscapeString = luaEscapeString;\n    function luaEscapeParams(params) {\n        let result = { ...params };\n        for (let k in result) {\n            result[k] = luaEscapeString(result[k]);\n        }\n        return result;\n    }\n    exports.luaEscapeParams = luaEscapeParams;\n});\n"],["command","define([\"require\", \"exports\", \"utils\", \"string-format\", \"child_process\", \"path\"], function (require, exports, utils_1, format, cp, path) {\n    \"use strict\";\n    Object.defineProperty(exports, \"__esModule\", { value: true });\n    class CommandRunner {\n        constructor(opts) {\n            this.discord = opts.discord;\n            this.server = opts.server;\n            this.options = opts;\n        }\n        resolveActionsToExtendeds(def) {\n            let arr = Array.isArray(def) ? def : [def];\n            return arr.map(x => typeof (x) === \"string\" ? { command: x } : x);\n        }\n        async run(actions, params) {\n            for (let action of this.resolveActionsToExtendeds(actions)) {\n                if (\"sleep\" in action) {\n                    await this.runSleepAction(action);\n                }\n                else if (\"command\" in action) {\n                    await this.runCommandLiteralAction(action, params);\n                }\n                else if (\"commandFile\" in action) {\n                    await this.runCommandFileAction(action, params);\n                }\n                else if (\"reboot\" in action) {\n                    await this.runRebootAction();\n                }\n                else if (\"shell\" in action) {\n                    await this.runShellLiteralAction(action, params);\n                }\n                else if (\"shellFile\" in action) {\n                    await this.runShellFileAction(action, params);\n                }\n                else if (\"shellExec\" in action) {\n                    await this.runShellExecAction(action, params);\n                }\n                else if (\"discordMessage\" in action) {\n                    await this.runDiscordMessageAction(action, params);\n                }\n                else if (\"waitLineIncludes\" in action) {\n                    await this.runWaitIncludeLineAction(action);\n                }\n                else if (\"waitLineRegexp\" in action) {\n                    await this.runWaitRegexpLineAction(action);\n                }\n                else if (\"stop\" in action) {\n                    await this.runStopAction(action);\n                }\n                else if (\"start\" in action) {\n                    await this.runStartAction(action);\n                }\n                else {\n                    throw new Error(\"Couldn't recognize action type from definition: \" + JSON.stringify(action));\n                }\n            }\n        }\n        async runSleepAction(action) {\n            await new Promise(ok => setTimeout(ok, action.sleep));\n        }\n        async runCommandLiteralAction(action, params) {\n            let completeCmd = format(action.command, utils_1.luaEscapeParams(params));\n            this.server.writeLine(completeCmd);\n        }\n        async runCommandFileAction(action, params) {\n            let formatString = (await utils_1.readTextFile(path.resolve(__dirname, action.commandFile))).replace(/[\\n\\r]+/g, \" \");\n            await this.runCommandLiteralAction({ command: formatString }, params);\n        }\n        async runRebootAction() {\n            await this.server.reboot();\n        }\n        async runDiscordMessageAction(action, params) {\n            let completeMsg = format(action.discordMessage, params);\n            await this.discord.sendMessage(completeMsg);\n        }\n        async runShellLiteralAction(action, params) {\n            let completeCmd = format(action.shell, params);\n            await new Promise((ok, bad) => cp.exec(completeCmd, {\n                cwd: this.options.shellWorkingDirectory,\n                maxBuffer: 512 * 1024 * 1024\n            }, async (err, stdout, stderr) => {\n                try {\n                    await this.doWithShellOutput(stdout, stderr, action);\n                }\n                catch (e) {\n                    bad(e);\n                }\n                err ? bad(err) : ok();\n            }));\n        }\n        async runShellFileAction(action, params) {\n            let formatString = await utils_1.readTextFile(path.resolve(__dirname, action.shellFile));\n            await this.runShellLiteralAction({ shell: formatString }, params);\n        }\n        async runShellExecAction(action, params) {\n            let command = format(action.shellExec, params);\n            let args = (action.args || []).map(arg => format(arg, params));\n            await new Promise((ok, bad) => cp.execFile(command, args, {\n                cwd: this.options.shellWorkingDirectory,\n                maxBuffer: 512 * 1024 * 1024,\n            }, async (err, stdout, stderr) => {\n                try {\n                    await this.doWithShellOutput(stdout, stderr, action);\n                }\n                catch (e) {\n                    bad(e);\n                }\n                err ? bad(err) : ok();\n            }));\n        }\n        async doWithShellOutput(stdout, stderr, flags) {\n            if (flags.stdoutToDiscord) {\n                if (flags.stdoutCodeWrap)\n                    stdout = \"```\\n\" + stdout + \"\\n```\";\n                await this.discord.sendMessage(stdout);\n            }\n            if (flags.stderrToDiscord) {\n                if (flags.stderrCodeWrap)\n                    stderr = \"```\\n\" + stderr + \"\\n```\";\n                await this.discord.sendMessage(stderr);\n            }\n        }\n        async runWaitRegexpLineAction(action) {\n            let regexp = new RegExp(action.waitLineRegexp);\n            await this.server.waitLine(line => !!line.match(regexp));\n        }\n        async runWaitIncludeLineAction(action) {\n            await this.server.waitLine(line => line.includes(action.waitLineIncludes));\n        }\n        async runStopAction(action) {\n            void action;\n            await this.server.stop();\n        }\n        async runStartAction(action) {\n            void action;\n            await this.server.start();\n        }\n    }\n    exports.CommandRunner = CommandRunner;\n});\n"],["game_server","define([\"require\", \"exports\", \"events\", \"child_process\", \"readline\", \"utils\"], function (require, exports, events_1, childProcess, readline, utils_1) {\n    \"use strict\";\n    Object.defineProperty(exports, \"__esModule\", { value: true });\n    class GameServer extends events_1.EventEmitter {\n        constructor(config) {\n            super();\n            this._process = null;\n            this._rebooting = 0;\n            this.lineHandlers = new Set();\n            this.config = config;\n        }\n        get process() {\n            if (!this._process)\n                throw new Error(\"Game server not started.\");\n            return this._process;\n        }\n        get isRunning() {\n            return !!this._process;\n        }\n        get rebooting() {\n            return !!this._rebooting;\n        }\n        async start() {\n            if (this.isRunning)\n                throw new Error(\"Server is already running, you can't start it twice.\");\n            this._process = childProcess.spawn(this.config.executablePath, this.config.runParams, {\n                cwd: this.config.workingDirectory,\n                stdio: [\"pipe\", \"pipe\", \"inherit\"]\n            });\n            let startedCallback = null;\n            let startPromise = new Promise(ok => startedCallback = ok);\n            let regs = [\n                [/^[\\d\\-\\s\\:]+\\[CHAT\\]\\s*([^:]+?):\\s*(.*?)\\s*$/, (player, message) => this.emit(\"chat\", { player, message })],\n                [/^[\\d\\-\\s\\:]+\\[JOIN\\]\\s*(.*?)\\s*joined the game/, player => this.emit(\"join\", { player })],\n                [/^[\\d\\-\\s\\:]+\\[LEAVE\\]\\s*(.*?)\\s*left the game/, player => this.emit(\"leave\", { player })],\n                [/from\\(CreatingGame\\) to\\(InGame\\)$/, () => startedCallback && startedCallback()],\n                [/\\[DEATH\\]: \\[(.*?)\\] by \\[(.*?)\\]/, (dead, killer) => this.emit(\"player_death\", { dead, killer })]\n            ];\n            let serverReader = readline.createInterface({ input: this.process.stdout });\n            serverReader.on(\"line\", line => utils_1.safetyWrap(() => {\n                process.stdout.write(line + \"\\n\", \"utf8\");\n                this.lineHandlers.forEach(handler => utils_1.safetyWrap(() => handler(line)));\n                if (line.startsWith(this.config.commandOutputPrefix)) {\n                    line = line.split(this.config.commandOutputNewlineSeparator).join(\"\\n\");\n                    this.emit(\"command_output\", {\n                        output: line.substr(this.config.commandOutputPrefix.length).replace(/(^\\s+|\\s+$)/g, \"\")\n                    });\n                }\n                else {\n                    for (let regAndHandler of regs) {\n                        let match = line.match(regAndHandler[0]);\n                        if (match) {\n                            regAndHandler[1](match[1], match[2]);\n                            break;\n                        }\n                    }\n                }\n            }));\n            let ourReader = readline.createInterface({ input: process.stdin });\n            ourReader.on(\"line\", line => utils_1.safetyWrap(() => this.writeLine(line)));\n            this.process.on(\"exit\", () => utils_1.safetyWrap(() => {\n                ourReader.close();\n                this._process = null;\n                this.emit(\"server_stop\");\n            }));\n            await startPromise;\n            this.emit(\"server_start\");\n        }\n        async stop() {\n            if (!this.isRunning)\n                throw new Error(\"Server is not running, you can't stop it.\");\n            this._rebooting++;\n            try {\n                let prom = new Promise(ok => this.once(\"server_stop\", ok));\n                this.process.kill(\"SIGINT\");\n                await prom;\n            }\n            finally {\n                this._rebooting--;\n            }\n        }\n        writeLine(line) {\n            this.process.stdin.write(line + \"\\n\", \"utf8\");\n        }\n        async reboot() {\n            await this.stop();\n            await this.start();\n        }\n        waitLine(matcher) {\n            return new Promise((ok, bad) => {\n                try {\n                    let handler = (line) => {\n                        try {\n                            if (matcher(line)) {\n                                this.lineHandlers.delete(handler);\n                                ok();\n                            }\n                        }\n                        catch (e) {\n                            this.lineHandlers.delete(handler);\n                            bad(e);\n                        }\n                    };\n                    this.lineHandlers.add(handler);\n                }\n                catch (e) {\n                    bad(e);\n                }\n            });\n        }\n    }\n    exports.GameServer = GameServer;\n});\n"],["bot","define([\"require\", \"exports\", \"discord.js\", \"shell-quote\", \"utils\", \"events\", \"string-format\"], function (require, exports, Discord, shell_quote_1, utils_1, events_1, format) {\n    \"use strict\";\n    Object.defineProperty(exports, \"__esModule\", { value: true });\n    class DiscordBot extends events_1.EventEmitter {\n        constructor(config) {\n            super();\n            this._client = null;\n            this._channel = null;\n            this.userId = null;\n            this.commands = {};\n            this.config = config;\n            Object.keys(config.commands).forEach(commandTemplate => {\n                let def = config.commands[commandTemplate];\n                this.registerCommand(commandTemplate, def);\n            });\n            if (config.autoHelp) {\n                let helpText = \"\";\n                Object.keys(this.commands).map(k => this.commands[k]).forEach(command => {\n                    Object.keys(command.overloads).map(k => command.overloads[k]).forEach(overload => {\n                        helpText += (helpText ? \"\\n\" : \"\")\n                            + \"**\" + command.name + \"**\"\n                            + (overload.argNames.length > 0 ? \" \" : \"\")\n                            + overload.argNames.join(\" \");\n                        if (typeof (overload.def) === \"object\" && overload.def.description) {\n                            helpText += \": \" + overload.def.description;\n                        }\n                    });\n                });\n                this.registerCommand(\"!help\", {\n                    description: \"Показать список команд\",\n                    actions: [\n                        { discordMessage: helpText }\n                    ]\n                });\n            }\n        }\n        get client() {\n            if (!this._client)\n                throw new Error(\"Discord bot not launched.\");\n            return this._client;\n        }\n        get channel() {\n            if (!this._channel)\n                throw new Error(\"Discord bot not launched.\");\n            return this._channel;\n        }\n        registerCommand(commandTemplate, def) {\n            let [commandName, ...argNames] = commandTemplate.split(\" \");\n            if (!(commandName in this.commands)) {\n                this.commands[commandName] = new DiscordCommand(commandName);\n            }\n            let cmd = this.commands[commandName];\n            cmd.addOverload(argNames, def);\n        }\n        isAuthorized(user, def) {\n            if (!def.userList)\n                return true;\n            let lists = Array.isArray(def.userList) ? def.userList : [def.userList];\n            let tag = user.tag;\n            for (let listName of lists)\n                for (let listTag of this.config.userLists[listName])\n                    if (listTag === tag)\n                        return true;\n            return false;\n        }\n        async start() {\n            this._client = new Discord.Client();\n            this.client.on(\"message\", msg => utils_1.safetyWrap(() => {\n                if (msg.channel.id === this.config.channelId && msg.author.id !== this.userId) {\n                    let guild = msg.guild;\n                    let hasGuild = guild && guild.available;\n                    let username = msg.author.username;\n                    let member = !hasGuild ? null : guild.member(msg.author);\n                    let nick = !member ? username : member.displayName;\n                    let cmdParts = shell_quote_1.parse(msg.cleanContent);\n                    if (cmdParts[0] in this.commands) {\n                        let { args, def } = this.commands[cmdParts[0]].selectOverload(cmdParts.slice(1));\n                        let fullParams = {\n                            username,\n                            nick,\n                            arg_count: (cmdParts.length - 1) + \"\",\n                            command_name: cmdParts[0],\n                            ...args\n                        };\n                        let actions;\n                        let defWithAdd = def;\n                        if (Array.isArray(defWithAdd.actions)) {\n                            actions = defWithAdd.actions;\n                            if (!this.isAuthorized(msg.author, defWithAdd)) {\n                                this.sendMessage(format(this.config.commandNotAllowedFormat, fullParams));\n                                return;\n                            }\n                        }\n                        else {\n                            actions = def;\n                        }\n                        this.emit(\"command\", {\n                            actions,\n                            params: fullParams\n                        });\n                    }\n                    else {\n                        this.emit(\"chat\", {\n                            author: nick,\n                            message: msg.cleanContent,\n                            attachmentCount: msg.attachments.size\n                        });\n                    }\n                }\n            }));\n            this.client.on(\"error\", err => {\n                console.error(\"Discord client lib failed: \", err.stack);\n            });\n            await this.client.login(this.config.token);\n            let channel = this.client.channels.get(this.config.channelId);\n            ;\n            if (!channel) {\n                throw new Error(\"Unknown channel ID: \" + this.config.channelId + \".\");\n            }\n            else {\n                this._channel = channel;\n            }\n            this.userId = this.client.user.id;\n        }\n        stop() {\n            this.client.destroy();\n        }\n        sendMessage(msg) {\n            this.channel.send(msg);\n        }\n    }\n    exports.DiscordBot = DiscordBot;\n    class DiscordCommand {\n        constructor(name) {\n            this.name = name;\n            this.overloads = {};\n        }\n        addOverload(argNames, def) {\n            if (!!this.overloads[argNames.length]) {\n                throw new Error(\"Failed to register overload of command \" + this.name + \": already has overload with this number of arguments (\" + argNames.length + \")\");\n            }\n            this.overloads[argNames.length] = { argNames, def };\n        }\n        selectOverload(argsArray) {\n            let argMap = {};\n            let argCount = argsArray.length;\n            while (!this.overloads[argCount] && argCount >= 0) {\n                argCount--;\n            }\n            if (argCount < 0) {\n                throw new Error(\"Failed to execute command \" + this.name + \": incorrect number of arguments.\");\n            }\n            let { argNames, def } = this.overloads[argCount];\n            for (let i = 0; i < argCount; i++) {\n                argMap[argNames[i]] = argsArray[i];\n            }\n            return { args: argMap, def };\n        }\n    }\n});\n"],["main","define([\"require\", \"exports\", \"utils\", \"path\", \"bot\", \"command\", \"game_server\", \"string-format\"], function (require, exports, utils_1, path, bot_1, command_1, game_server_1, format) {\n    \"use strict\";\n    Object.defineProperty(exports, \"__esModule\", { value: true });\n    function main() {\n        utils_1.safetyWrap(asyncMain);\n    }\n    exports.main = main;\n    async function createDiscordBot(config) {\n        let botToken = (await utils_1.readTextFile(path.resolve(__dirname, config.botTokenFile))).trim();\n        let botChannelId = (await utils_1.readTextFile(path.resolve(__dirname, config.channelId))).trim();\n        return new bot_1.DiscordBot({\n            token: botToken,\n            autoHelp: !!config.autoHelp,\n            channelId: botChannelId,\n            commands: config.discordCommands,\n            commandNotAllowedFormat: config.discordCommandNotAllowedFormat,\n            userLists: config.userLists\n        });\n    }\n    async function createGameServer(config) {\n        return new game_server_1.GameServer({\n            executablePath: path.resolve(__dirname, config.serverExecutable),\n            workingDirectory: path.resolve(__dirname, config.serverWorkingDirectory),\n            runParams: process.argv.slice(2),\n            commandOutputNewlineSeparator: config.discordNewlineSeparator,\n            commandOutputPrefix: config.discordCommandOutputPrefix\n        });\n    }\n    function wireUpDiscordBot(config, discordBot, commandRunner) {\n        let commandConstantParams = {\n            n: config.discordNewlineSeparator,\n            pref: config.discordCommandOutputPrefix\n        };\n        discordBot.on(\"command\", e => utils_1.safetyWrap(async () => {\n            let params = {\n                ...commandConstantParams,\n                ...e.params\n            };\n            await commandRunner.run(e.actions, params);\n        }));\n        discordBot.on(\"chat\", (e) => utils_1.safetyWrap(async () => {\n            let params = {\n                author: e.author,\n                message: e.message,\n                attachments_count: e.attachmentCount + \"\",\n                ...commandConstantParams\n            };\n            params[\"attachment_string\"] = e.attachmentCount < 1 ? \"\" : format(config.discordMessageHasAttachments, params);\n            await commandRunner.run({\n                command: config.serverChatFormat\n            }, params);\n            process.stdout.write(format(config.serverStdoutChatFormat, params) + \"\\n\", \"utf8\");\n        }));\n    }\n    function wireUpGameServer(config, server, commandRunner) {\n        server.on(\"chat\", e => utils_1.safetyWrap(async () => await commandRunner.run({ discordMessage: config.discordChatFormat }, e)));\n        server.on(\"join\", e => utils_1.safetyWrap(async () => await commandRunner.run({ discordMessage: config.discordJoinFormat }, e)));\n        server.on(\"leave\", e => utils_1.safetyWrap(async () => await commandRunner.run({ discordMessage: config.discordLeaveFormat }, e)));\n        server.on(\"player_death\", e => utils_1.safetyWrap(async () => {\n            await commandRunner.run({ discordMessage: e.killer ? config.discordPlayerKilledFormat : config.discordPlayerDiedFormat }, e);\n        }));\n        server.on(\"server_start\", e => utils_1.safetyWrap(async () => {\n            await commandRunner.run({ discordMessage: config.discordServerStarted }, e);\n            await commandRunner.run(config.onServerStart, {});\n        }));\n        server.on(\"server_stop\", e => utils_1.safetyWrap(async () => await commandRunner.run({ discordMessage: config.discordServerStopped }, e)));\n        server.on(\"command_output\", e => utils_1.safetyWrap(async () => await commandRunner.run({ discordMessage: e.output }, {})));\n    }\n    async function asyncMain() {\n        let config = JSON.parse(await utils_1.readTextFile(path.resolve(__dirname, \"./config.json\")));\n        let discordBot = await createDiscordBot(config);\n        let server = await createGameServer(config);\n        let commandRunner = new command_1.CommandRunner({\n            discord: discordBot,\n            server,\n            shellWorkingDirectory: path.resolve(__dirname, config.serverWorkingDirectory)\n        });\n        wireUpDiscordBot(config, discordBot, commandRunner);\n        wireUpGameServer(config, server, commandRunner);\n        server.on(\"server_stop\", () => utils_1.safetyWrap(() => {\n            if (!server.rebooting) {\n                console.error(\"Server shut down. Terminating wrapper.\");\n                setTimeout(() => {\n                    discordBot.stop();\n                }, 1000);\n            }\n        }));\n        console.error(\"Starting discord bot...\");\n        await discordBot.start();\n        console.error(\"Discord bot started.\");\n        process.on(\"SIGINT\", () => { });\n        process.on(\"SIGTERM\", () => { });\n        await server.start();\n    }\n});\n"]],{
"dirname":function(name){
	return name.replace(/\/?[^\/]+$/, "");
},
"join":function(){
	var result = [];
	for(var i = 0; i < arguments.length; i++){
		var x = arguments[i];
		(i === 0) || (x = x.replace(/^\//, ""));
		(i === arguments.length - 1) || (x = x.replace(/\/$/, ""));
		x && result.push(x);
	}
	return this.normalize(result.join("/"));
},
"normalize":function(name){
	var x = name, xx;
	while(true){
		xx = x.replace(/[^\/]+\/\.\.\//g, "");
		if(xx.length === x.length)
			break;
		x = xx;
	}
	while(true){
		xx = x.replace(/\.\//g, "");
		if(xx.length === x.length)
			break;
		x = xx;
	}
	return x;
},
"resolve":function(base, name){
	return name.charAt(0) !== "."? name: this.join(this.dirname(base), name)
}
},function(code, define){ return eval(code) },"main","main", null, function(r){
	return require(r);
})
