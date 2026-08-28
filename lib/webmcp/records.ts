/**
 * Objects used as string-keyed maps.
 *
 * A plain `{}` inherits `Object.prototype`, which means `record["__proto__"] = value`
 * invokes the inherited setter and changes the object's prototype instead of adding a
 * key. The key then does not exist and `Object.keys` never mentions it.
 *
 * That matters here because the keys come from someone else's markup. A form field named
 * `__proto__` would disappear from a generated schema with no error and no warning, and
 * the emitted tool would quietly refuse to accept a field the form has. A null prototype
 * makes the assignment ordinary.
 *
 * `JSON.stringify`, `Object.entries`, and spread all behave normally on these.
 */
export function emptyRecord<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}
