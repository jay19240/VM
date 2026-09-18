import { Gfx3NoiseParams } from '@lib/gfx3_noise/gfx3_noise_manager';

export interface NoisePanelOptions {
  params: Required<Gfx3NoiseParams>;
  getAnimate: () => boolean;
  setAnimate: (v: boolean) => void;
  onChange: () => void;
};

export function CREATE_NOISE_TWEAK_PANEL(opts: NoisePanelOptions): HTMLElement {
  const panel = document.createElement('div');
  panel.style.cssText = 'background:rgba(0,0,0,0.55); padding:8px 10px; color:#fff; font-family:monospace; font-size:11px; backdrop-filter:blur(4px); width:300px; max-height:170px; overflow-y:auto; border-radius:4px;';

  const gAnim = ADD_GROUP(panel, 'Animation');
  ADD_CHECKBOX(gAnim, 'animate', opts.getAnimate(), v => opts.setAnimate(v));

  const gParams = ADD_GROUP(panel, 'Parameters');
  ADD_SLIDER(gParams, 'scale', 0.5, 10, 0.1, opts.params.scale, v => { opts.params.scale = v; opts.onChange(); });
  ADD_SLIDER(gParams, 'speed', 0, 1, 0.01, opts.params.speed, v => { opts.params.speed = v; opts.onChange(); });
  ADD_SLIDER(gParams, 'numBands', 2, 30, 1, opts.params.numBands, v => { opts.params.numBands = v; opts.onChange(); });
  ADD_SLIDER(gParams, 'warpStrength', 0, 5, 0.1, opts.params.warpStrength, v => { opts.params.warpStrength = v; opts.onChange(); });
  ADD_SLIDER(gParams, 'smoothness', 0, 1, 0.01, opts.params.smoothness, v => { opts.params.smoothness = v; opts.onChange(); });

  const gToggles = ADD_GROUP(panel, 'Toggles');
  ADD_CHECKBOX(gToggles, 'showContours', opts.params.showContours, v => { opts.params.showContours = v; opts.onChange(); });
  ADD_CHECKBOX(gToggles, 'greyscaleMode', opts.params.greyscaleMode, v => { opts.params.greyscaleMode = v; opts.onChange(); });

  const gPalette = ADD_GROUP(panel, 'Palette');
  for (let i = 0; i < 6; i++) {
    const initial = String(opts.params.colors[i] ?? '#ffffff');
    ADD_COLOR(gPalette, `color ${i}`, initial, v => {
      opts.params.colors[i] = v;
      opts.onChange();
    });
  }

  return panel;
}

function ADD_GROUP(parent: HTMLElement, title: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin-top:6px;';
  const hdr = document.createElement('div');
  hdr.textContent = title;
  hdr.style.cssText = 'font-weight:bold; color:#9cf; margin-bottom:2px;';
  wrap.appendChild(hdr);
  parent.appendChild(wrap);
  return wrap;
}

function ADD_SLIDER(parent: HTMLElement, label: string, min: number, max: number, step: number, initial: number, onChange: (v: number) => void): void {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex; align-items:center; gap:6px; margin-bottom:1px;';

  const lbl = document.createElement('span');
  lbl.textContent = label;
  lbl.style.cssText = 'flex:0 0 90px; font-size:10px;';

  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(initial);
  input.style.cssText = 'flex:1 1 auto; min-width:0;';

  const val = document.createElement('span');
  val.textContent = initial.toFixed(3);
  val.style.cssText = 'flex:0 0 50px; font-size:10px; text-align:right;';

  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    val.textContent = v.toFixed(3);
    onChange(v);
  });

  row.appendChild(lbl);
  row.appendChild(input);
  row.appendChild(val);
  parent.appendChild(row);
}

function ADD_CHECKBOX(parent: HTMLElement, label: string, initial: boolean, onChange: (v: boolean) => void): void {
  const row = document.createElement('label');
  row.style.cssText = 'display:flex; align-items:center; gap:6px; margin-bottom:1px; cursor:pointer;';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = initial;

  const lbl = document.createElement('span');
  lbl.textContent = label;
  lbl.style.cssText = 'font-size:10px;';

  input.addEventListener('change', () => onChange(input.checked));

  row.appendChild(input);
  row.appendChild(lbl);
  parent.appendChild(row);
}

function ADD_COLOR(parent: HTMLElement, label: string, initial: string, onChange: (v: string) => void): void {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex; align-items:center; gap:6px; margin-bottom:1px;';

  const lbl = document.createElement('span');
  lbl.textContent = label;
  lbl.style.cssText = 'flex:0 0 90px; font-size:10px;';

  const input = document.createElement('input');
  input.type = 'color';
  input.value = initial;
  input.style.cssText = 'flex:0 0 60px; height:20px; padding:0; border:1px solid #555; background:transparent; cursor:pointer;';

  input.addEventListener('input', () => onChange(input.value));

  row.appendChild(lbl);
  row.appendChild(input);
  parent.appendChild(row);
}
