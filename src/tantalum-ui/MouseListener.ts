
export class MouseListener {
    mouseStart: [number, number] = [0, 0];

    mouseUpHandler = () => {
        document.removeEventListener('mouseup', this.mouseUpHandler);
        document.removeEventListener('mousemove', this.mouseMoveHandler);
    };
    mouseMoveHandler = (evt: MouseEvent) => {
        this.callback(this.mouseStart, this.mapMouseEvent(evt));
    };
    mouseDown = (evt: MouseEvent) => {
        evt.preventDefault();
        this.mouseStart = this.mapMouseEvent(evt);
        this.callback(this.mouseStart, this.mouseStart);
        document.addEventListener('mouseup', this.mouseUpHandler);
        document.addEventListener('mousemove', this.mouseMoveHandler);
    };

    constructor(
        public target: HTMLElement,
        public callback: (mouseStart: [number, number], mouse: [number, number]) => void
    ) {
        target.addEventListener('mousedown', this.mouseDown);
    }
    mapMouseEvent(evt: { clientX: number; clientY: number; }): [number, number] {
        var rect = this.target.getBoundingClientRect();
        return [evt.clientX - rect.left, evt.clientY - rect.top];
    }
}
