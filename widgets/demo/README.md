# Demo widget

`widget.js` is a dependency-free SVG line renderer used by the template demonstration. The Observable JS cell in the chapter owns the mathematics and reactive parameter; the module receives generic `{x, y}` point data and only draws it.

For a new interactive component, copy this directory, give the copy a descriptive name appropriate to the new note repository, and keep its public interface small. The surrounding `.qmd` chapter should remain understandable if the component is removed.
