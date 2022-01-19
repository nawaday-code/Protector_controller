

function inputChange() {
    let buffer = new ArrayBuffer(4);
    let dv = new DataView(buffer);
    dv.setUint16(0, 2);
    dv.setUint16(1, 28);

    let group = dv.getUint16(0);
    let element = dv.getUint16(1);
    console.log(group);
    console.log(group.toString(16));
    console.log(element);
    console.log(element.toString(16));
}

let imgFile = document.getElementById('imgFile');
imgFile.addEventListener('change', inputChange);


