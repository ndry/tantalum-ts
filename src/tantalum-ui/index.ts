export { ProgressBar } from "./ProgressBar";
export { Slider } from "./Slider";
export { ButtonGrid } from "./ButtonGrid";
export { ButtonGroup } from "./ButtonGroup";
export { MouseListener } from "./MouseListener";

export function replace(targetId: string, el: HTMLElement) {
    const target = document.getElementById(targetId)!;
    target.parentNode!.replaceChild(el, target);
}