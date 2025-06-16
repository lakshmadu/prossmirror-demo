import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Schema, DOMParser } from "prosemirror-model";
import { schema as basicSchema } from "prosemirror-schema-basic";
import { exampleSetup } from "prosemirror-example-setup";
import { tableNodes, tableEditing } from "prosemirror-tables";

// Extend the basic schema with table nodes that support nested tables
const nodes = basicSchema.spec.nodes.append(tableNodes({
  tableGroup: "block",
  // Allow tables inside table cells for nested tables
  cellContent: "block+ table*"
}));

const mySchema = new Schema({
  nodes,
  marks: basicSchema.spec.marks
});

document.addEventListener("DOMContentLoaded", function () {
  const editor = document.querySelector("#editor");
  if (!editor) return;

  window.view = new EditorView(editor, {
    state: EditorState.create({
      doc: DOMParser.fromSchema(mySchema).parse(editor),
      plugins: [
        ...exampleSetup({ schema: mySchema }),
        tableEditing()
      ]
    })
  });
});
