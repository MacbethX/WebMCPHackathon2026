# Spike 3 result: Lightning CSS and the declarative pseudo-classes (Next 16.3.3, captured 2026-08-27 during M1)

Question: do `:tool-form-active` and `:tool-submit-active` survive Next's CSS pipeline?

Answer: yes, but the build warns. Next 16 compiles CSS Modules with Lightning CSS, which
does not know these pseudo-classes and emits an "unknown pseudo-class" warning per rule,
with an import trace. The rules are still emitted verbatim into the chunk CSS, with the
CSS Module class hash applied correctly:

```
.sandbox-module__JCBgnq__form:tool-form-active{outline-offset:3px;background:#f2f9f0;outline:3px solid #2f6b3a}
.sandbox-module__JCBgnq__submit:tool-submit-active{color:#fffdf7;background:#2f6b3a}
```

Verified by grepping `.next/static/chunks/*.css` after `npm run build`. Note that the
compiled CSS lands in `.next/static/chunks/`, not `.next/static/css/`; grepping the
latter gives a false negative and the wrong conclusion.

Consequences:
1. The warning is benign. Do not "fix" it by deleting the rules; that removes working
   styling. Do not wrap them in `@supports selector(...)` without re-verifying emission.
2. Each pseudo-class needs its own rule. A selector list is dropped whole by any parser
   that rejects one of its selectors, so pairing a known selector with an unknown one
   loses both.
3. A clean build cannot currently coexist with this styling. Revisit if Lightning CSS
   learns the selectors, or if the warning ever becomes an error.
