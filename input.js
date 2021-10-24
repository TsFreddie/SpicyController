// ----------------
//      GLOBAL
// ----------------
const connections = [];
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

// -----------------
//  CONNECTION POOL
// -----------------
async function newConnection() {
  const address = document.getElementById('address');
  const port = document.getElementById('port');
  const password = document.getElementById('password');
  const conn = new SpiceAPI();
  connections.push(conn);
  return new Promise((resolve, reject) => {
    conn.connect(address.value, parseInt(port.value), password.value);
    conn.onopen = () => {
      resolve(conn);
    };
    conn.onerror = e => {
      reject(e);
    };
  });
}

async function pullConnection() {
  if (connections.length > 0) {
    return connections.pop();
  }
  return newConnection();
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
    this.type = 'Button';
    this.element.className = 'controllerButton';
    this.element.style.left = x + '%';
    this.element.style.top = y + '%';
    this.element.style.width = width + '%';
    this.element.style.height = height + '%';

    this.pressed = false;
    this.processed = false;

    root.appendChild(this.element);
  }

  destroy() {
    connections.buttons.reset(this.btname);
    root.removeChild(this.element);
  }

  down() {
    this.pressed = true;
    pullConnection().then(conn => {
      conn.buttons.write([this.btname, 1]).then(() => {
        connections.push(conn);
      });
    });
  }

  up() {
    this.pressed = false;
    pullConnection().then(conn => {
      conn.buttons.write([this.btname, 0]).then(() => {
        connections.push(conn);
      });
    });
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
  for (const conn of connections) {
    conn.close();
  }
  connections.splice(0, connections.length);

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
  hide('controllerWin');
  hide('controller');
  endControl();
}

async function connect() {
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

  save('address', address.value);
  save('port', port.value);
  try {
    await newConnection();
    hide('connectWin');
    showControlWindow();
  } catch (e) {
    console.error(e);
    disconnect();
  }
}

// -------------------
//  CONTROLLER WINDOW
// -------------------

function showControlWindow() {
  clearControls();
  show('controllerWin');
  hide('controller');
  endControl();
}

function hideControlWindow() {
  hide('controllerWin');
}

function customControl() {
  try {
    const text = document.getElementById('code').value;
    const data = JSON.parse(text);
    setControls(data);
    save('custom', text);
    hideControlWindow();
    show('controller');
    startControl();
  } catch (e) {
    console.error(e);
  }
}

// ----------------
//   CONTORL HOOK
// ----------------

function getControl(x, y) {
  return controls.find(control => {
    const rect = control.element.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  });
}

async function processControl(e) {
  e.preventDefault();
  console.log(e);
  if (e.changedTouches) {
    for (const touch of e.changedTouches) {
      const x = touch.clientX;
      const y = touch.clientY;

      const control = getControl(x, y);
      if (!control) continue;

      if (control.type === 'Button') {
        if (touch.force > 0 && !control.pressed) {
          control.down();
        } else if (touch.force <= 0 && control.pressed) {
          control.up();
        }
      }
    }
  }
}

function startControl() {
  document.addEventListener('touchstart', processControl);
  document.addEventListener('touchend', processControl);
  document.addEventListener('touchmove', processControl);
}

function endControl() {
  document.removeEventListener('touchstart', processControl);
  document.removeEventListener('touchend', processControl);
  document.removeEventListener('touchmove', processControl);
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
