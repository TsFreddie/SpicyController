// ----------------
//      GLOBAL
// ----------------
const api = new SpiceAPI();
const controller = {
  data: null,
};
const controls = [];

// ----------------
//     HELPERS
// ----------------

function save(key, value) {
  window.localStorage.setItem(key, value);
}

function load(key) {
  return window.localStorage.getItem(key);
}

function show(id) {
  document.getElementById(id).style.display = 'inherit';
}

function hide(id) {
  document.getElementById(id).style.display = 'none';
}

// ----------------
//     CONTROLS
// ----------------

class Button {
  constructor(root, x, y, width, height, btname) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.btname = btname;
    this.element = document.createElement('div');
    this.element.className = 'controllerButton';
    this.element.style.left = x + '%';
    this.element.style.top = y + '%';
    this.element.style.width = width + '%';
    this.element.style.height = height + '%';

    this.element.addEventListener('touchstart', () => {
      api.buttons.write([this.btname, 1]);
    });
    this.element.addEventListener('touchend', () => {
      api.buttons.write([this.btname, 0]);
    });
    root.appendChild(this.element);
  }

  destroy() {
    api.buttons.reset(this.btname);
    root.removeChild(this.element);
  }
}

function setControls(data, api) {
  controller.data = data;
  const width = data.width || 100;
  const height = data.height || 100;
  const offsetX = data.offsetX || 0;
  const offsetY = data.offsetY || 0;

  updateController();

  const root = document.getElementById('controller');
  for (const control of data.controls || []) {
    controls.push(
      new Button(
        root,
        ((control.x + offsetX) / width) * 100,
        ((control.y + offsetY) / height) * 100,
        (control.width / width) * 100,
        (control.height / height) * 100,
        control.name
      )
    );
  }
}

function updateController() {
  if (!controller.data) return;

  const data = controller.data;

  const root = document.getElementById('controller');

  const width = data.width || 100;
  const height = data.height || 100;

  if (window.innerHeight / window.innerWidth < height / width) {
    const percentWidth = (window.innerHeight / height / window.innerWidth) * width * 100;
    root.style.width = `calc(${percentWidth}%)`;
    root.style.paddingBottom = `calc(${height / width} * ${percentWidth}%)`;
  } else {
    root.style.width = 'calc(100%)';
    root.style.paddingBottom = `calc(${height / width} * 100%)`;
  }
}

function clearControls() {
  controller.data = null;
  for (const control of controls) {
    control.destroy();
  }
  controls.splice(0, controls.length);
}

// ----------------
//  CONNECT WINDOW
// ----------------

function disconnect() {
  api.close();
  const enable = elem => {
    elem.disabled = false;
  };

  const address = document.getElementById('address');
  const port = document.getElementById('port');
  const password = document.getElementById('password');

  enable(address);
  enable(port);
  enable(password);
  enable(document.getElementById('connect'));

  show('connectWin');
  hide('controller');
}

function connect() {
  const disable = elem => {
    elem.disabled = true;
  };

  const address = document.getElementById('address');
  const port = document.getElementById('port');
  const password = document.getElementById('password');

  disable(address);
  disable(port);
  disable(password);
  disable(document.getElementById('connect'));

  api.onopen = () => {
    hide('connectWin');
    showControlWindow();
  };

  api.onerror = e => {
    console.error(e);
    disconnect();
  };

  save('address', address.value);
  save('port', port.value);
  api.connect(address.value, parseInt(port.value), password.value);
}

// -------------------
//  CONTROLLER WINDOW
// -------------------

function showControlWindow() {
  clearControls();
  show('controllerWin');
  hide('controller');
}

function hideControlWindow() {
  hide('controllerWin');
}

function customControl() {
  console.log(document.getElementById('code'));
  try {
    const text = document.getElementById('code').value;
    const data = JSON.parse(text);
    setControls(data);
    save('custom', text);
    hideControlWindow();
    show('controller');
  } catch (e) {
    console.error(e);
  }
}

// ----------------
//       MAIN
// ----------------

let root = document.getElementById('content');

window.addEventListener('load', () => {
  root = document.getElementById('content');

  const address = load('address');
  const port = load('port');
  if (address) document.getElementById('address').value = address;
  if (port) document.getElementById('port').value = port;

  const custom = load('custom');
  if (custom) document.getElementById('code').value = custom;
});

window.addEventListener('resize', () => {
  updateController();
});
