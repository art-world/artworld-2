// Keypad dial state. The visitor places a call by entering digits and
// confirming; matches against config.dial.directory. No on-demand playback —
// dialing is the only way in.

export function createDial(config, { onConnect, onInvalid } = {}) {
  let digits = '';

  function entry(digit) {
    digits += digit;
    return digits;
  }

  function backspace() {
    digits = digits.slice(0, -1);
    return digits;
  }

  function clear() {
    digits = '';
  }

  function call() {
    const match = config.dial.directory.find((d) => d.number === digits);
    if (match) {
      onConnect?.(match);
    } else {
      onInvalid?.(digits);
    }
    clear();
  }

  function current() {
    return digits;
  }

  return { entry, backspace, clear, call, current };
}
