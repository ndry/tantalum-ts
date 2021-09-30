import { ButtonGrid } from "./ButtonGrid";

export class ButtonGroup extends ButtonGrid {
    constructor(
        vertical: boolean,
        labels: string[],
        selectionCallback: (idx: number) => void
    ) {
        super(vertical ? 1 : labels.length, labels, selectionCallback);
    }
}
