import * as twgl from "twgl.js";

export function colorBufferFloatTest(
    gl: WebGL2RenderingContext,
    multiBufExt: WEBGL_draw_buffers
) {
    /* This one is slightly awkward. The WEBGL_color_buffer_float
       extension is apparently causing a lot of troubles for
       ANGLE, so barely anyone bothers to implement it. On the other
       hand, most platforms do actually implicitly support float render
       targets just fine, even though they pretend they don't.
       So to *actually* figure out whether we can do float attachments
       or not, we have to do a very hacky up-front blending test
       and see whether the results come out correct.
       Hurray WebGL! */

    const blend_test_vert = `precision highp float; 
    attribute vec3 Position; 
    void main() { gl_Position = vec4(Position, 1.0); }`;
    const blend_test_frag = `precision highp float; 
    void main() { gl_FragColor = vec4(vec3(7.0, 59.0, -7.0), 1.0); }`;
    const blend_test_pack_frag = `precision highp float; 
    uniform sampler2D Tex; 
    void main() { gl_FragColor = texture2D(Tex, vec2(0.5))*(1.0/255.0); }`;

    const shader = twgl.createProgramInfo(gl, [blend_test_vert, blend_test_frag], er => { throw new Error(er); });
    const packShader = twgl.createProgramInfo(gl, [blend_test_vert, blend_test_pack_frag], er => { throw new Error(er); });
    const target = twgl.createTexture(gl, {
        width: 1,
        height: 1,
        format: gl.RGBA,
        type: gl.FLOAT,
        minMag: gl.NEAREST,
        wrap: gl.REPEAT,
        src: [-6.0, 10.0, 30.0, 2.0],
    });

    const fbo = gl.createFramebuffer();
    const vbo = twgl.createBufferInfoFromArrays(gl, {
        Position: [
            1.0, 1.0, 0.0,
            -1.0, 1.0, 0.0,
            -1.0, -1.0, 0.0,
            1.0, -1.0, 0.0
        ],
    });

    gl.viewport(0, 0, 1, 1);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    multiBufExt.drawBuffersWEBGL([gl.COLOR_ATTACHMENT0]);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target, 0);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    gl.useProgram(shader.program);
    twgl.drawObjectList(gl, [{
        programInfo: shader,
        bufferInfo: vbo,
        uniforms: {},
        type: gl.TRIANGLE_FAN,
    }]);
    twgl.drawObjectList(gl, [{
        programInfo: shader,
        bufferInfo: vbo,
        uniforms: {},
        type: gl.TRIANGLE_FAN,
    }]);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.BLEND);

    /* Of course we can neither read back texture contents or read floating point
       FBO attachments in WebGL, so we have to do another pass, convert to uint8
       and check whether the results are ok.
       Hurray WebGL! */
    twgl.drawObjectList(gl, [{
        programInfo: packShader,
        bufferInfo: vbo,
        uniforms: {
            Tex: target
        },
        type: gl.TRIANGLE_FAN,
    }]);

    const pixels = new Uint8Array([0, 0, 0, 0]);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    if (pixels[0] != 8 || pixels[1] != 128 || pixels[2] != 16 || pixels[3] != 4) {
        console.log("Floating point blending test failed. Result was " + pixels + " but should have been " + [8, 128, 16, 4]);
        throw new Error("Your platform does not support floating point attachments");
    }
}