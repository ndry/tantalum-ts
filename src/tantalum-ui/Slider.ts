

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
