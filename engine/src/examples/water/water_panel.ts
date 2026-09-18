import { Gfx3Water } from '@lib/gfx3_water/gfx3_water';
import { Gfx3WaterParam } from '@lib/gfx3_water/gfx3_water_shader';

export type ImpactCtrl = {
  getStrength: () => number;
  setStrength: (v: number) => void;
  getRadius: () => number;
  setRadius: (v: number) => void;
  getLifetime: () => number;
  setLifetime: (v: number) => void;
  dropRandom: () => void;
};

export function CREATE_WATER_TWEAK_PANEL(water: Gfx3Water, impact: ImpactCtrl): HTMLElement {
  const panel = document.createElement('div');
  panel.style.cssText = 'background:rgba(0,0,0,0.55); padding:8px 10px; color:#fff; font-family:monospace; font-size:11px; backdrop-filter:blur(4px); width:320px; max-height:170px; overflow-y:auto; border-radius:4px;';

  const bind = (key: number, min: number, max: number, step: number, label: string, group: HTMLElement) => {
    ADD_SLIDER(group, label, min, max, step, water.getParam(key), v => water.setParam(key, v));
  };

  const gWave = ADD_GROUP(panel, 'Wave (Perlin)');
  bind(Gfx3WaterParam.WAVE_AMPLITUDE, 0, 1.5, 0.01, 'amplitude', gWave);
  bind(Gfx3WaterParam.WAVE_SCALE, 0.01, 1.0, 0.005, 'scale', gWave);
  bind(Gfx3WaterParam.WAVE_SPEED, 0, 2, 0.01, 'speed', gWave);
  bind(Gfx3WaterParam.WAVE_CHOPPINESS, 1, 4, 0.05, 'choppiness', gWave);
  bind(Gfx3WaterParam.WAVE_STEP_X, 0.05, 5, 0.05, 'stepX', gWave);
  bind(Gfx3WaterParam.WAVE_STEP_Z, 0.05, 5, 0.05, 'stepZ', gWave);

  const gNormal = ADD_GROUP(panel, 'Normal Map');
  bind(Gfx3WaterParam.NORMAL_MAP_ENABLED, 0, 1, 1, 'enabled', gNormal);
  bind(Gfx3WaterParam.NORMAL_MAP_SCROLL_X, -0.2, 0.2, 0.005, 'scrollX', gNormal);
  bind(Gfx3WaterParam.NORMAL_MAP_SCROLL_Y, -0.2, 0.2, 0.005, 'scrollY', gNormal);
  bind(Gfx3WaterParam.NORMAL_MAP_INTENSITY, 0, 2, 0.01, 'intensity', gNormal);
  bind(Gfx3WaterParam.NORMAL_MAP_SCALE, 0.1, 30, 0.1, 'scale', gNormal);

  const gSurf = ADD_GROUP(panel, 'Surface');
  bind(Gfx3WaterParam.SURFACE_COLOR_ENABLED, 0, 1, 1, 'enabled', gSurf);
  bind(Gfx3WaterParam.SURFACE_COLOR_R, 0, 1, 0.01, 'red', gSurf);
  bind(Gfx3WaterParam.SURFACE_COLOR_G, 0, 1, 0.01, 'green', gSurf);
  bind(Gfx3WaterParam.SURFACE_COLOR_B, 0, 1, 0.01, 'blue', gSurf);
  bind(Gfx3WaterParam.SURFACE_COLOR_FACTOR, 0, 1, 0.01, 'opacity', gSurf);

  const gOpt = ADD_GROUP(panel, 'Optics');
  bind(Gfx3WaterParam.OPTICS_ENV_MAP_ENABLED, 0, 1, 1, 'envEnabled', gOpt);
  bind(Gfx3WaterParam.OPTICS_ENV_INTENSITY, 0, 3, 0.01, 'envIntensity', gOpt);
  bind(Gfx3WaterParam.OPTICS_FRESNEL_POWER, 0.1, 10, 0.1, 'fresnelPower', gOpt);
  bind(Gfx3WaterParam.OPTICS_FRESNEL_BIAS, 0, 1, 0.01, 'reflectivity', gOpt);

  const gSun = ADD_GROUP(panel, 'Sun');
  bind(Gfx3WaterParam.SUN_ENABLED, 0, 1, 1, 'enabled', gSun);
  bind(Gfx3WaterParam.SUN_DIRECTION_X, -1, 1, 0.05, 'dirX', gSun);
  bind(Gfx3WaterParam.SUN_DIRECTION_Y, -1, 1, 0.05, 'dirY', gSun);
  bind(Gfx3WaterParam.SUN_DIRECTION_Z, -1, 1, 0.05, 'dirZ', gSun);

  const gSunCol = ADD_GROUP(panel, 'Sun Color');
  bind(Gfx3WaterParam.SUN_COLOR_R, 0, 1, 0.01, 'red', gSunCol);
  bind(Gfx3WaterParam.SUN_COLOR_G, 0, 1, 0.01, 'green', gSunCol);
  bind(Gfx3WaterParam.SUN_COLOR_B, 0, 1, 0.01, 'blue', gSunCol);
  bind(Gfx3WaterParam.SUN_COLOR_FACTOR, 0, 5, 0.05, 'intensity', gSunCol);

  const gImp = ADD_GROUP(panel, 'Impact');
  ADD_SLIDER(gImp, 'strength', 0, 5, 0.05, impact.getStrength(), v => impact.setStrength(v));
  ADD_SLIDER(gImp, 'radius', 0.5, 30, 0.5, impact.getRadius(), v => impact.setRadius(v));
  ADD_SLIDER(gImp, 'lifetime', 0.2, 10, 0.1, impact.getLifetime(), v => impact.setLifetime(v));
  ADD_BUTTON(gImp, 'Drop Random', () => impact.dropRandom());

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

function ADD_BUTTON(parent: HTMLElement, label: string, onClick: () => void): void {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.style.cssText = 'width:100%; margin-top:3px; padding:4px 6px; background:#234; color:#fff; border:1px solid #456; border-radius:3px; font-family:monospace; font-size:11px; cursor:pointer;';
  btn.addEventListener('mouseenter', () => { btn.style.background = '#345'; });
  btn.addEventListener('mouseleave', () => { btn.style.background = '#234'; });
  btn.addEventListener('click', onClick);
  parent.appendChild(btn);
}
