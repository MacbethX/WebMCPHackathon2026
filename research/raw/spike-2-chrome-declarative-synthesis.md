# Spike 2 result: Chrome declarative schema synthesis (Le Petit Bistro, Chrome 149+ flag, captured 2026-08-27 by Andrew)

Inspector: WebMCP Inspector side panel. Page registered 1 declarative tool (book_table_le_petit_bistro), 0 imperative. "Read only hint: Unknown" for declarative tools (no attribute exists to express hints on forms).

Findings:
1. <select> -> anyOf[{const,title}...] PLUS flat enum[] (dual representation; titles carry visible option labels).
2. Form values remain strings (guests: "1".."6" string enum; numeric semantics in description only).
3. Quirks: time regex placed in "format" (nonstandard; should be pattern); validation limits (min chars/digits, date bounds) live in description prose, not minLength/minimum. Chrome appends date guidance "(Dates MUST be provided in 'YYYY-MM-DD' format.)".
4. required[] synthesized from required attributes (name, phone, date, time, guests; seating/requests optional).
5. input type=date -> format:"date".
6. Third declarative attribute confirmed in use: toolparamdescription per input (source of per-param descriptions).

Builder routing rule derived: declarative for form-shaped actions (incl. selects/dates); imperative for hints, strict schemas, non-form actions. Generator mirrors dual enum shape, string typing, required synthesis; exceeds Chrome by emitting proper pattern/minLength in imperative output.

Full captured schema:
{"type":"object","properties":{"name":{"type":"string","description":"Customer's full name (min 2 chars)"},"phone":{"type":"string","description":"Customer's phone number (min 10 digits)"},"date":{"type":"string","format":"date","description":"Reservation date. Must be today or future. (Dates MUST be provided in 'YYYY-MM-DD' format.)"},"time":{"type":"string","format":"^([01][0-9]|2[0-3]):[0-5][0-9]$","description":"Reservation time"},"guests":{"type":"string","anyOf":[{"type":"string","const":"1","title":"1 Person"},{"type":"string","const":"2","title":"2 People"},{"type":"string","const":"3","title":"3 People"},{"type":"string","const":"4","title":"4 People"},{"type":"string","const":"5","title":"5 People"},{"type":"string","const":"6","title":"6 People or more"}],"enum":["1","2","3","4","5","6"],"description":"Number of people dining. Must be a string value between '1' and '5', or '6' for parties of 6 or more."},"seating":{"type":"string","anyOf":[{"type":"string","const":"Main Dining","title":"Main Dining Room"},{"type":"string","const":"Terrace","title":"Terrace (Outdoor)"},{"type":"string","const":"Private Booth","title":"Private Booth"},{"type":"string","const":"Bar","title":"Bar Counter"}],"enum":["Main Dining","Terrace","Private Booth","Bar"],"description":"Preferred seating area"},"requests":{"type":"string","description":"Special requests (allergies, occasions, etc.)"}},"required":["name","phone","date","time","guests"]}
