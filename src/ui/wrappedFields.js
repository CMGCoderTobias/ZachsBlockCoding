import * as Blockly from "blockly";

export function wrapText(value, width = 58) {
  return String(value).split(/\r?\n/).flatMap(line => {
    const lines = [];
    while (line.length > width) {
      let split = line.lastIndexOf(" ", width);
      if (split < width / 2) split = width;
      else split++;
      lines.push(line.slice(0, split));
      line = line.slice(split);
    }
    lines.push(line);
    return lines;
  });
}

function wrapped(Base) {
  return class extends Base {
    constructor(...args) { super(...args); this.maxDisplayLength = Infinity; }
    render_() {
      if (this.textElement_) {
        this.textElement_.querySelectorAll("tspan").forEach(span => span.remove());
        if (this.textContent_ && !this.textContent_.parentNode) this.textElement_.append(this.textContent_);
      }
      super.render_();
      const lines = wrapText(this.getText());
      if (lines.length <= 1 || !this.textElement_) return;
      const text = this.textElement_;
      const originX = Number(text.getAttribute("x")) || 0;
      const originY = Number(text.getAttribute("y")) || 0;
      if (this.textContent_) this.textContent_.nodeValue = "";
      let width = 0;
      lines.forEach((line, index) => {
        const span = document.createElementNS("http://www.w3.org/2000/svg", "tspan");
        span.setAttribute("x", String(originX));
        span.setAttribute("y", String(originY + index * 20));
        span.setAttribute("xml:space", "preserve");
        span.textContent = line || " ";
        text.append(span);
        width = Math.max(width, span.getComputedTextLength());
      });
      this.size_.width = width + 20;
      this.size_.height += (lines.length - 1) * 20;
      this.positionBorderRect_();
    }
  };
}

export class WrappedInput extends wrapped(Blockly.FieldTextInput) {}
export class WrappedLabel extends wrapped(Blockly.FieldLabel) {}
