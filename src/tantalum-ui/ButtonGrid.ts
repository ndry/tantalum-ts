
export class ButtonGrid {
    el: HTMLElement;
    columns: HTMLElement[];
    cells: HTMLElement[];
    selectedButton = 0;

    constructor(
        public cols: number,
        labels: string[],
        public selectionCallback: (idx: number) => void
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
