
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
