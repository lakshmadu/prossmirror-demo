import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Schema, DOMParser as ProseMirrorDOMParser } from "prosemirror-model";
import { schema as basicSchema } from "prosemirror-schema-basic";
import { exampleSetup } from "prosemirror-example-setup";
import { tableNodes, tableEditing } from "prosemirror-tables";
import { Plugin } from "prosemirror-state";

// Enhanced styledDiv, styledSpan, and image nodes to support more HTML attributes
const styledDiv = {
  group: "block",
  content: "inline*",
  attrs: { style: { default: null }, class: { default: null }, align: { default: null } },
  parseDOM: [
    {
      tag: "div",
      getAttrs(dom) {
        return {
          style: dom.getAttribute("style"),
          class: dom.getAttribute("class"),
          align: dom.getAttribute("align")
        };
      }
    }
  ],
  toDOM(node) {
    const attrs = {};
    if (node.attrs.style) attrs.style = node.attrs.style;
    if (node.attrs.class) attrs.class = node.attrs.class;
    if (node.attrs.align) attrs.align = node.attrs.align;
    return ["div", attrs, 0];
  }
};
const styledSpan = {
  inline: true,
  group: "inline",
  content: "text*",
  attrs: { style: { default: null }, class: { default: null } },
  parseDOM: [
    {
      tag: "span",
      getAttrs(dom) {
        return {
          style: dom.getAttribute("style"),
          class: dom.getAttribute("class")
        };
      }
    }
  ],
  toDOM(node) {
    const attrs = {};
    if (node.attrs.style) attrs.style = node.attrs.style;
    if (node.attrs.class) attrs.class = node.attrs.class;
    return ["span", attrs, 0];
  }
};
const image = {
  inline: true,
  attrs: {
    src: {},
    alt: { default: null },
    title: { default: null },
    style: { default: null },
    width: { default: null },
    height: { default: null },
    class: { default: null }
  },
  group: "inline",
  draggable: true,
  parseDOM: [
    {
      tag: "img[src]",
      getAttrs(dom) {
        return {
          src: dom.getAttribute("src"),
          title: dom.getAttribute("title"),
          alt: dom.getAttribute("alt"),
          style: dom.getAttribute("style"),
          width: dom.getAttribute("width"),
          height: dom.getAttribute("height"),
          class: dom.getAttribute("class")
        };
      }
    }
  ],
  toDOM(node) {
    const { src, alt, title, style, width, height, class: cls } = node.attrs;
    const attrs = { src };
    if (alt) attrs.alt = alt;
    if (title) attrs.title = title;
    if (style) attrs.style = style;
    if (width) attrs.width = width;
    if (height) attrs.height = height;
    if (cls) attrs.class = cls;
    return ["img", attrs];
  }
};

// Compose the new nodes spec, following the working TS demo
const nodes = basicSchema.spec.nodes
  .addToEnd("div", styledDiv)
  .addToEnd("span", styledSpan)
  .addToEnd("image", image)
  .append(
    tableNodes({
      tableGroup: "block",
      cellContent: "block+",
      cellAttributes: {
        style: {
          default: null,
          getFromDOM(dom) { return dom.getAttribute('style') || null; },
          setDOMAttr(value, attrs) { if (value) attrs.style = value; }
        },
        class: {
          default: null,
          getFromDOM(dom) { return dom.getAttribute('class') || null; },
          setDOMAttr(value, attrs) { if (value) attrs.class = value; }
        },
        align: {
          default: null,
          getFromDOM(dom) { return dom.getAttribute('align') || null; },
          setDOMAttr(value, attrs) { if (value) attrs.align = value; }
        },
        valign: {
          default: null,
          getFromDOM(dom) { return dom.getAttribute('valign') || null; },
          setDOMAttr(value, attrs) { if (value) attrs.valign = value; }
        },
        width: {
          default: null,
          getFromDOM(dom) { return dom.getAttribute('width') || null; },
          setDOMAttr(value, attrs) { if (value) attrs.width = value; }
        },
        height: {
          default: null,
          getFromDOM(dom) { return dom.getAttribute('height') || null; },
          setDOMAttr(value, attrs) { if (value) attrs.height = value; }
        }
      }
    })
  );

const mySchema = new Schema({
  nodes,
  marks: basicSchema.spec.marks
});

// Helper function to convert HTML table to ProseMirror table node
function htmlTableToPMTable(htmlTable, schema) {
  // Get table rows
  const rows = Array.from(htmlTable.querySelectorAll("tr"));
  if (!rows.length) return null;

  // Build table rows
  const rowNodes = rows.map(row => {
    const cells = Array.from(row.querySelectorAll("td,th")).map(cell => {
      // Recursively parse cell content (could be blocks, paragraphs, or even nested tables)
      const cellContent = [];
      cell.childNodes.forEach(child => {
        if (child.nodeType === 1 && child.tagName.toLowerCase() === "table") {
          // Nested table
          const nested = htmlTableToPMTable(child, schema);
          if (nested) cellContent.push(nested);
        } else if (child.nodeType === 1) {
          // Use ProseMirror DOMParser for other content
          const frag = ProseMirrorDOMParser.fromSchema(schema).parse(child);
          if (frag) cellContent.push(frag);
        } else if (child.nodeType === 3) {
          // Text node
          const text = child.textContent.trim();
          if (text) {
            const para = schema.nodes.paragraph.createAndFill(null, schema.text(text));
            if (para) cellContent.push(para);
          }
        }
      });
      // If cell is empty, add an empty paragraph
      if (cellContent.length === 0) {
        cellContent.push(schema.nodes.paragraph.createAndFill());
      }
      return schema.nodes.table_cell.createAndFill(null, cellContent);
    });
    return schema.nodes.table_row.createAndFill(null, cells);
  });

  // Build the table node
  return schema.nodes.table.createAndFill(null, rowNodes);
}

// Custom paste handler for nested tables
const nestedTablePasteHandler = new Plugin({
  props: {
    handlePaste(view, event, slice) {
      const { state } = view;
      const { selection, schema } = state;
      const cell = selection.$anchor.node(-1);

      // Only handle if inside a table cell and clipboard has HTML
      if (
        cell &&
        cell.type.name === "table_cell" &&
        event.clipboardData &&
        event.clipboardData.getData("text/html")
      ) {
        const html = event.clipboardData.getData("text/html");
        const parser = new window.DOMParser();
        const doc = parser.parseFromString(html, "text/html");
        const table = doc.querySelector("table");

        if (table) {
          // Use the custom function to build a PM table node
          const pmTable = htmlTableToPMTable(table, schema);
          if (pmTable) {
            const tr = state.tr.replaceSelectionWith(pmTable, false);
            view.dispatch(tr);
            return true;
          }
        }
      }
      return false;
    }
  }
});

document.addEventListener("DOMContentLoaded", function () {
  const editor = document.querySelector("#editor");
  if (!editor) return;

  window.view = new EditorView(editor, {
    state: EditorState.create({
      doc: ProseMirrorDOMParser.fromSchema(mySchema).parse(editor),
      plugins: [
        ...exampleSetup({ schema: mySchema }),
        tableEditing({
          // Enable table cell selection
          allowTableSelection: true,
          // Enable table cell resizing
          cellMinWidth: 25,
          // Enable table column resizing
          columnResizing: true
        }),
        nestedTablePasteHandler // Add our custom paste handler
      ]
    })
  });

  // Insert the email template automatically for demo
  if (window.insertEmailTemplate) window.insertEmailTemplate(window.view);
});

// Helper to insert a sample email template into the editor
function insertEmailTemplate(view) {
  const html = `
<table align="left" border="0" cellpadding="0" cellspacing="0" height="100%" style="font-family: Arial; font-size:12px;  width:540px; table-layout: fixed;" ><tbody><tr><td align="left" valign="top"><table align="center" border="0" cellpadding="0" cellspacing="0" class="informationTabs TableEditor" height="100%" style="font-family: Arial; font-size:12px;  width:410px; table-layout: fixed;"><tbody><tr><td align="center" valign="top"><table align="center" border="0" cellpadding="0" cellspacing="0" class="editorTable" style=" width:410px; table-layout: fixed;"><tbody><tr><td style="text-align: center; vertical-align: top;"><div style="width: 129px;height: 37.4px;background-color: #0f9bd3;margin: 0;border-radius: 0 0 8px 8px;"><div style="width:85px; display: inline-block"><span class="countOfPhoto" style="display: block;font-size: 15px;color: white;line-height: 20px;font-weight: bold;padding-top: 3px;">%pCount%</span> <span style="display: block;color: white;font-size: 8px;line-height: 10px;">Photos</span></div><div style="width: 40px;display: inline-block;line-height: 1;text-align: left;vertical-align: top;"><p style="margin: 9px 0 0 0;"><img src="https://imtest.net.au/Content/images/tenanatPortal/EmailCamera.png" style="width:18px" width="18" /></p><div>&nbsp;</div></div></div></td><td style="text-align: center; vertical-align: top;"><div style="width: 129px;height: 37.4px;background-color: #58bb71;margin: 0;border-radius: 0 0 8px 8px;"><div style="width:85px; display: inline-block"><span class="countOfVideo" style="display: block;font-size: 15px;color: white;line-height: 20px;font-weight: bold;padding-top: 3px;">%vCount%</span> <span style="display: block;color: white;font-size: 8px;line-height: 10px;">Videos</span></div><div style="width: 40px;display: inline-block;line-height: 1;text-align: left;vertical-align: top;"><p style="margin: 11px 0 0 0;"><img src="https://imtest.net.au/Content/images/tenanatPortal/EmailVideo.png" style="width:22px" width="22" /></p><div>&nbsp;</div></div></div></td><td style="text-align: center; vertical-align: top;"><div style="width: 129px;height: 37.4px;background-color: #e32c28;margin: 0;border-radius: 0 0 8px 8px;"><div style="width:85px; display: inline-block"><span class="countOfAction" style="display: block;font-size: 15px;color: white;line-height: 18px;font-weight: bold;padding-top: 2px;">%wCount%</span> <span style="display: block;color: white;font-size: 8px;line-height: 8px;">Actions req by Landlords</span></div><div style="width: 40px;display: inline-block;line-height: 1;text-align: left;vertical-align: top;"><p style="margin: 11px 0 0 0;"><img src="https://imtest.net.au/Content/images/tenanatPortal/EmailAction.png" style="width:18px" width="18" /></p><div>&nbsp;</div></div></div></td></tr></tbody></table></td></tr></tbody></table><p>&nbsp;<span>%Report Link%</span></p><p>&nbsp;</p><p>&nbsp;</p><p>&nbsp;</p><p>&nbsp;</p><p>Outgoing</p><table></table><table></table><table></table></td></tr></tbody></table>
  `;
  const parser = new window.DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  const pmDoc = ProseMirrorDOMParser.fromSchema(view.state.schema).parse(doc.body);
  view.dispatch(view.state.tr.replaceSelectionWith(pmDoc));
}

// Optionally, insert the template on load for demo
window.insertEmailTemplate = () => insertEmailTemplate(window.view);
