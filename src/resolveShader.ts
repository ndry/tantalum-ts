import * as _shaders from "./tantalum-shaders";

const shaders = _shaders as { [name: string]: string };

export function resolveShader(name: string): string {
    if (!(name in shaders)) throw new Error("Unable to find shader source for '" + name + "'");

    /* Rudimentary include handling for convenience.
       Not the most robust, but it will do for our purposes */
    return shaders[name].replaceAll(/#include "(.+)"/g, (_, g1) => resolveShader(g1));
};