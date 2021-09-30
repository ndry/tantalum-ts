function glTypeSize(gl: WebGL2RenderingContext, type: GLenum) {
    switch (type) {
        case gl.BYTE:
        case gl.UNSIGNED_BYTE:
            return 1;
        case gl.SHORT:
        case gl.UNSIGNED_SHORT:
            return 2;
        case gl.INT:
        case gl.UNSIGNED_INT:
        case gl.FLOAT:
            return 4;
        default:
            return 0;
    }
}

export class Texture {
    type: GLenum;
    format: GLenum;
    glName: WebGLTexture | null;

    boundUnit = -1;

    constructor(
        public gl: WebGL2RenderingContext,
        public width: GLint,
        public height: GLint,
        channels: number,
        isFloat: boolean,
        isLinear: boolean,
        isClamped: boolean,
        texels: ArrayBufferView | null,
    ) {
        const coordMode = isClamped ? gl.CLAMP_TO_EDGE : gl.REPEAT;
        this.type = isFloat ? gl.FLOAT : gl.UNSIGNED_BYTE;
        this.format = [gl.LUMINANCE, gl.RG, gl.RGB, gl.RGBA][channels - 1];

        this.glName = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.glName);
        gl.texImage2D(gl.TEXTURE_2D, 0, this.format, this.width, this.height, 0, this.format, this.type, texels);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, coordMode);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, coordMode);
        this.setSmooth(isLinear);
    }
    setSmooth(smooth: boolean) {
        const gl = this.gl;
        const interpMode = smooth ? gl.LINEAR : gl.NEAREST;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, interpMode);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, interpMode);
    }
    copy(texels: ArrayBufferView) {
        const gl = this.gl;
        gl.texImage2D(gl.TEXTURE_2D, 0, this.format, this.width, this.height, 0, this.format, this.type, texels);
    }
    bind(unit: number) {
        const gl = this.gl;
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, this.glName);
        this.boundUnit = unit;
    }
}

export class RenderTarget {
    glName: WebGLFramebuffer | null;

    constructor(
        public gl: WebGL2RenderingContext,
        public multiBufExt: WEBGL_draw_buffers,
    ) {
        this.glName = gl.createFramebuffer();
    }
    bind() {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.glName);
    }
    unbind() {
        const gl = this.gl;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    attachTexture(texture: Texture, index: number) {
        const gl = this.gl;
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + index, gl.TEXTURE_2D, texture.glName, 0);
    }
    detachTexture(index: number) {
        const gl = this.gl;
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + index, gl.TEXTURE_2D, null, 0);
    }
    drawBuffers(numBufs: number) {
        const gl = this.gl;
        const buffers = Array.from({ length: numBufs }, (_, i) => gl.COLOR_ATTACHMENT0 + i);
        this.multiBufExt.drawBuffersWEBGL(buffers);
    }
}

export class Shader {
    uniforms: { [name: string]: any } = {};
    program: WebGLProgram;
    vertex: WebGLShader;
    fragment: WebGLShader;

    constructor(
        public gl: WebGL2RenderingContext,
        shaderDict: { [name: string]: string },
        vert: string,
        frag: string
    ) {
        this.vertex = this.createShaderObject(shaderDict, vert, false);
        this.fragment = this.createShaderObject(shaderDict, frag, true);

        this.program = gl.createProgram()!;
        gl.attachShader(this.program, this.vertex);
        gl.attachShader(this.program, this.fragment);
        gl.linkProgram(this.program);

        if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
            alert("Could not initialise shaders");
    }
    bind() {
        const gl = this.gl;
        gl.useProgram(this.program);
    }
    createShaderObject(
        shaderDict: { [name: string]: string },
        name: string,
        isFragment: boolean
    ) {
        const gl = this.gl;
        let shaderSource = this.resolveShaderSource(shaderDict, name);
        const shaderObject = gl.createShader(isFragment ? gl.FRAGMENT_SHADER : gl.VERTEX_SHADER)!;
        gl.shaderSource(shaderObject, shaderSource);
        gl.compileShader(shaderObject);

        if (!gl.getShaderParameter(shaderObject, gl.COMPILE_STATUS)) {
            /* Add some line numbers for convenience */
            var lines = shaderSource.split("\n");
            for (var i = 0; i < lines.length; ++i)
                lines[i] = ("   " + (i + 1)).slice(-4) + " | " + lines[i];
            shaderSource = lines.join("\n");

            throw new Error(
                (isFragment ? "Fragment" : "Vertex") + " shader compilation error for shader '" + name + "':\n\n    " +
                gl.getShaderInfoLog(shaderObject)!.split("\n").join("\n    ") +
                "\nThe expanded shader source code was:\n\n" +
                shaderSource);
        }

        return shaderObject;
    }
    resolveShaderSource(
        shaderDict: { [name: string]: string },
        name: string
    ) {
        if (!(name in shaderDict))
            throw new Error("Unable to find shader source for '" + name + "'");
        let shaderSource = shaderDict[name];

        /* Rudimentary include handling for convenience.
           Not the most robust, but it will do for our purposes */
        const pattern = new RegExp('#include "(.+)"');
        let match;
        while (match = pattern.exec(shaderSource)) {
            shaderSource = shaderSource.slice(0, match.index) +
                this.resolveShaderSource(shaderDict, match[1]) +
                shaderSource.slice(match.index + match[0].length);
        }

        return shaderSource;
    }
    uniformIndex(name: string) {
        const gl = this.gl;
        if (!(name in this.uniforms))
            this.uniforms[name] = gl.getUniformLocation(this.program, name);
        return this.uniforms[name];
    }
    uniformTexture(name: string, texture: Texture) {
        const gl = this.gl;
        const id = this.uniformIndex(name);
        if (id != -1)
            gl.uniform1i(id, texture.boundUnit);
    }
    uniformF(name: string, f: number) {
        const gl = this.gl;
        const id = this.uniformIndex(name);
        if (id != -1)
            gl.uniform1f(id, f);
    }
    uniform2F(name: string, f1: number, f2: number) {
        const gl = this.gl;
        var id = this.uniformIndex(name);
        if (id != -1)
            gl.uniform2f(id, f1, f2);
    }
}

interface VertexBuffer_Attribute {
    name: string,
    size: number,
    type: GLenum,
    norm: boolean,
    offset: number,
    index: number,
}

export class VertexBuffer {
    attributes: VertexBuffer_Attribute[] = [];
    elementSize = 0;
    length: number = 0;
    glName: WebGLBuffer | null = null;

    constructor(
        public gl: WebGL2RenderingContext,
    ) {
    }
    bind() {
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.glName);
    }
    addAttribute(name: string, size: number, type: GLenum, norm: boolean) {
        const gl = this.gl;
        this.attributes.push({
            name,
            size,
            type,
            norm,
            offset: this.elementSize,
            index: -1
        });
        this.elementSize += size * glTypeSize(gl, type);
    }
    init(numVerts: number) {
        const gl = this.gl;
        this.length = numVerts;
        this.glName = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.glName);
        gl.bufferData(gl.ARRAY_BUFFER, this.length * this.elementSize, gl.STATIC_DRAW);
    }
    copy(data: BufferSource) {
        const gl = this.gl;
        if (data.byteLength != this.length * this.elementSize)
            throw new Error("Resizing VBO during copy strongly discouraged");
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    }
    draw(shader: Shader, mode: GLenum, length?: GLsizei) {
        const gl = this.gl;
        for (var i = 0; i < this.attributes.length; ++i) {
            this.attributes[i].index = gl.getAttribLocation(shader.program, this.attributes[i].name);
            if (this.attributes[i].index >= 0) {
                var attr = this.attributes[i];
                gl.enableVertexAttribArray(attr.index);
                gl.vertexAttribPointer(attr.index, attr.size, attr.type, attr.norm, this.elementSize, attr.offset);
            }
        }

        gl.drawArrays(mode, 0, length ? length : this.length);

        for (var i = 0; i < this.attributes.length; ++i) {
            if (this.attributes[i].index >= 0) {
                gl.disableVertexAttribArray(this.attributes[i].index);
                this.attributes[i].index = -1;
            }
        }
    }
}
