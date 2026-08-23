function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function randomDelayMs(config, random = Math.random) {
  const min = config.toyRandomMinIntervalMs;
  const max = Math.max(min, config.toyRandomMaxIntervalMs);
  return min + Math.floor(random() * (max - min + 1));
}

export function chooseRandomToyControl(toy, config, previous = null, random = Math.random) {
  if (!toy?.functions?.length) throw new Error('No chat-partner toy sliders are available.');
  const control = toy.functions[Math.min(toy.functions.length - 1, Math.floor(random() * toy.functions.length))];
  const step = Number(control.step);
  if (!Number.isFinite(step) || step <= 0) throw new Error(`${control.name} has an invalid slider step.`);
  const requestedMin = clamp(config.toyRandomMinLevel, control.min, control.max);
  const requestedMax = clamp(config.toyRandomMaxLevel, control.min, control.max);
  const firstStep = Math.ceil((Math.min(requestedMin, requestedMax) - control.min) / step);
  const lastStep = Math.floor((Math.max(requestedMin, requestedMax) - control.min) / step);
  if (lastStep < firstStep) throw new Error(`${control.name} has no values inside the configured random range.`);
  const count = lastStep - firstStep + 1;
  let selectedStep = firstStep + Math.min(count - 1, Math.floor(random() * count));
  let value = Number((control.min + selectedStep * step).toFixed(10));
  if (count > 1 && previous?.functionIndex === control.index && previous.value === value) {
    selectedStep = firstStep + ((selectedStep - firstStep + 1) % count);
    value = Number((control.min + selectedStep * step).toFixed(10));
  }
  return { functionIndex: control.index, name: control.name, value };
}
