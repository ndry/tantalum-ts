export function replace(targetId: string, el: HTMLElement) {
    const target = document.getElementById(targetId)!;
    target.parentNode!.replaceChild(el, target);
}

export class ProgressBar {
    el: HTMLElement;
    progressBar: HTMLElement;
    label?: HTMLElement;

    progressFraction = 0;
    progressPercentage = 0;

    constructor(hasLabel: boolean) {
        const progressBackground = document.createElement("div");
        progressBackground.className = "progress";

        this.progressBar = document.createElement("div");
        this.progressBar.className = "progress-bar";
        progressBackground.appendChild(this.progressBar);

        this.setProgress(0.0);

        this.el = document.createElement("div");
        this.el.appendChild(progressBackground);

        if (hasLabel) {
            this.label = document.createElement("p");
            this.label.className = "progress-label";

            this.el.appendChild(this.label);
        }
    }
    getProgress() {
        return this.progressFraction;
    }
    setProgress(progressFraction: number) {
        this.progressFraction = progressFraction;
        this.progressPercentage = Math.min(Math.max(Math.floor(progressFraction * 100.0), 0), 100);
        this.progressBar.style.width = this.progressPercentage.toString() + "%";
    }
    setProgressWithoutTransition(progressFraction: number) {
        this.progressBar.classList.add("notransition");
        this.setProgress(progressFraction);
        this.progressBar.offsetHeight; /* Flush CSS changes */
        this.progressBar.classList.remove("notransition");
    }
    setLabel(text: string) {
        if (this.label)
            this.label.textContent = text;
    }
    getProgressPercentage() {
        return this.progressPercentage;
    }
}


export class Slider {
    el: HTMLElement;
    sliderBackground: HTMLElement;
    sliderBar: HTMLElement;
    sliderHandle: HTMLElement;
    label?: HTMLElement;

    value = 0;

    constructor(
        public minValue: number,
        public maxValue: number,
        hasLabel: boolean,
        public callback: (value: number) => void
    ) {
        this.sliderBackground = document.createElement("div");
        this.sliderBackground.className = "slider";

        this.sliderBar = document.createElement("div");
        this.sliderBar.className = "slider-bar";
        this.sliderBackground.appendChild(this.sliderBar);

        this.sliderHandle = document.createElement("a");
        this.sliderHandle.className = "slider-handle";
        this.sliderBackground.appendChild(this.sliderHandle);

        var mouseMoveListener = this.mouseMove.bind(this);
        function mouseUpListener() {
            document.removeEventListener("mousemove", mouseMoveListener);
            document.removeEventListener("mouseup", mouseUpListener);
        }

        this.sliderHandle.addEventListener("mousedown", function (event) {
            event.preventDefault();
            document.addEventListener("mousemove", mouseMoveListener);
            document.addEventListener("mouseup", mouseUpListener);
        });

        this.el = document.createElement("div");
        this.el.appendChild(this.sliderBackground);

        if (hasLabel) {
            this.label = document.createElement("p");
            this.label.className = "slider-label";

            this.el.appendChild(this.label);
        }

        this.setPosition(0.45);
    }
    mouseMove(event: MouseEvent) {
        var rect = this.sliderBackground.getBoundingClientRect();
        this.setPosition((event.clientX - rect.left) / (rect.right - rect.left));
    }
    setLabel(text: string) {
        if (this.label) {
            this.label.textContent = text;
        }
    }
    setValue(value: number) {
        value = Math.min(this.maxValue, Math.max(this.minValue, value));
        if (value != this.value) {
            this.value = value;
            var percentage = Math.max(Math.min(Math.floor(100.0 * (value - this.minValue) / (this.maxValue - this.minValue)), 100.0), 0.0);
            this.sliderHandle.style.left = this.sliderBar.style.width = percentage.toString() + "%";

            if (this.callback)
                this.callback(value);
        }
    }
    setPosition(position: number) {
        this.setValue(Math.floor(this.minValue + position * (this.maxValue - this.minValue)));
    }
    show(show: boolean) {
        var display = show ? "block" : "none";
        this.sliderBackground.style.display = display;
        if (this.label)
            this.label.style.display = display;
    }
}

export class ButtonGrid {
    el: HTMLElement;
    columns: HTMLElement[];
    cells: HTMLElement[];
    selectedButton = 0;

    constructor(
        public cols: number,
        labels: string[],
        public selectionCallback: (idx: number) => void,
    ) {
        this.selectionCallback = selectionCallback;

        this.el = document.createElement("div");
        this.el.className = "button-grid";

        this.columns = Array.from({ length: cols }, () => {
            const column = document.createElement("div");
            column.className = "button-grid-column";
            return column;
        });
        this.el.append(...this.columns);

        this.cells = labels.map((label, i) => {
            var column = i % this.cols;
            var cell = document.createElement("div");
            cell.className = "button stretch-button button-grid-button";
            cell.appendChild(document.createTextNode(label));

            if (i == 0)
                cell.classList.add("button-grid-tl");
            if (i == this.cols - 1)
                cell.classList.add("button-grid-tr");
            if (i + this.cols >= labels.length) {
                if (column == 0)
                    cell.classList.add("button-grid-bl");
                if (column == this.cols - 1 || i == labels.length - 1)
                    cell.classList.add("button-grid-br");
            }

            cell.addEventListener("click", () => this.select(i));

            this.columns[column].appendChild(cell);

            return cell;
        });

        this.select(0);
    }
    select(idx: number) {
        if (idx < 0 || idx >= this.cells.length)
            return;


        this.cells[this.selectedButton].classList.remove("active");
        this.cells[idx].classList.add("active");

        if (this.selectedButton != idx && this.selectionCallback)
            this.selectionCallback(idx);
        this.selectedButton = idx;
    }
    show(show: boolean) {
        this.el.style.display = show ? "flex" : "none";
    }
}

export class ButtonGroup extends ButtonGrid {
    constructor(
        vertical: boolean,
        labels: string[],
        selectionCallback: (idx: number) => void
    ) {
        super(vertical ? 1 : labels.length, labels, selectionCallback)
    }
}

export class MouseListener {
    mouseStart: [number, number] = [0, 0];

    mouseUpHandler = () => {
        document.removeEventListener('mouseup', this.mouseUpHandler);
        document.removeEventListener('mousemove', this.mouseMoveHandler);
    }
    mouseMoveHandler = (evt: MouseEvent) => {
        this.callback(this.mouseStart, this.mapMouseEvent(evt));
    }
    mouseDown = (evt: MouseEvent) => {
        evt.preventDefault();
        this.mouseStart = this.mapMouseEvent(evt);
        this.callback(this.mouseStart, this.mouseStart);
        document.addEventListener('mouseup', this.mouseUpHandler);
        document.addEventListener('mousemove', this.mouseMoveHandler);
    }

    constructor(
        public target: HTMLElement,
        public callback: (mouseStart: [number, number], mouse: [number, number]) => void,
    ) {
        target.addEventListener('mousedown', this.mouseDown);
    }
    mapMouseEvent(evt: { clientX: number, clientY: number }): [number, number] {
        var rect = this.target.getBoundingClientRect();
        return [evt.clientX - rect.left, evt.clientY - rect.top];
    }
}