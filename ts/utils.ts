import * as fs from "fs";

export type MapObject<T> = { [key: string]: T }

export async function safetyWrap<T>(action: () => T | Promise<T>): Promise<T | null>{
	try {
		return await Promise.resolve(action());
	} catch(e){
		console.error("Wrapper failed: " + e.stack);
		return null;
	}
}

export function readTextFile(path: string): Promise<string> {
	return new Promise<string>((ok, bad) => {
		fs.readFile(path, "utf8", (err, result) => err? bad(err): ok(result))
	});
}

export function luaEscapeString(str: string){
	return str.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "");
}

export function luaEscapeParams(params: MapObject<string>){
	let result = {...params};
	for(let k in result){
		result[k] = luaEscapeString(result[k]);
	}
	return result;
}