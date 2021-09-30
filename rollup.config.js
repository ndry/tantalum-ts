import typescript from '@rollup/plugin-typescript';
import { string } from "rollup-plugin-string";

/**
 * @type {import('rollup').RollupOptions}
 */
const config = {
    input: 'src/index.ts',
    output: {
        file: 'app.generated.js',
        format: 'iife',
        sourcemap: 'inline',
    },
    plugins: [
        typescript(),
        string({
            include: "**/*.txt"
        }),
    ]
};

export default config;