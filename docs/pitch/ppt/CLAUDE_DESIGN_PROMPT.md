# Prompt for Claude Design (or any slide tool) when you want to change the deck

The finished deck is `Unicomply-SIH26264.pptx` in this folder. It is the AstraX file with only the text, the icons and one chart replaced, so the safest way to edit it is to keep working in that file. If you want Claude Design to make further text changes, attach the PPTX (or its PDF export) and paste the prompt below. I could not open Claude Design from here, so check that it accepts a PPTX upload; if it only takes images, attach the PDF export.

## Prompt

```
Attached is a 6-slide Smart India Hackathon idea deck. It is a finished layout: do not redesign it.

Change only the text I ask for. Keep every shape, icon, font, colour, size and position, the AstraX and SIH headers, the six slide titles and their order. If new text does not fit a box, shorten the text. Never shrink the font, move a shape or add decoration.

Rules for the words:
- Put a number, a name or a source in every claim. Keep every existing number exactly; do not round or add new ones.
- Use plain verbs ("is", "has", "sends"). Write in the order things happen.
- State limits the way the deck already does, flatly: what fails, how often, what the fix is.
- Keep each text box within its current line count.
- Do not use: crucial, pivotal, vital, robust, seamless, cutting-edge, comprehensive, empower, leverage, testament, underscore, showcase, landscape, vibrant, groundbreaking, innovative, holistic, streamline, enhance, "plays a key role", "stands as".
- No "not just X but Y", no tacked-on "-ing" clauses ("..., ensuring transparency"), no lists of exactly three adjectives, no vague sources ("studies show", "experts agree").
- No emoji, no extra bold, no em dashes.

Before you return it: compare every slide with the attached original, list any box that overflows or any element you could not keep identical, and do not hide either.

What I want changed: <describe the edit here>
```

## Why the prompt is written this way

Wikipedia's page on signs of AI writing warns that a banned-word list alone makes text vaguer, so the prompt asks for specific facts first and lists the patterns second. The patterns that matter for slide text are significance filler, puffery, "-ing" tails, "not X but Y" headlines, rule-of-three lists and unsourced claims.

## Exporting the PDF

SIH accepts only a PDF. Open `Unicomply-SIH26264.pptx` in PowerPoint (or upload it to Canva or Google Slides) and export to PDF. Keynote draws green hill strips behind some boxes, and it does the same to the original AstraX file, so they are a Keynote rendering problem, not part of the design. I could not test PowerPoint or Canva here, so check the exported PDF page by page against the AstraX original before you upload it.
