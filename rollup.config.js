import path from 'path';
import typescript from '@rollup/plugin-typescript';
import { string } from "rollup-plugin-string";
import { nodeResolve } from '@rollup/plugin-node-resolve';
import license from 'rollup-plugin-license';

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
        nodeResolve(),
        license({
            thirdParty: {
                output: path.join(__dirname, 'LICENSES-npm.md')
            },
        })
    ]
};

export default config;