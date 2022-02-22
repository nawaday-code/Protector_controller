//＜＜注意＞＞デフォルトでは、
// C#のBinaryReader.ReadInt16()はリトルエンディアン、
// javascriptのDataView.gerInt16はビッグエンディアン
// DICOMのバイト配列はリトルエンディアン
// javascriptで読み込む際はgetInt16(_, true)
// 第二引数をtrueにしてリトルエンディアンで読み込むこと

const fileReader = new FileReader();
const dcmFile = document.getElementById('dcmFile');
dcmFile.addEventListener('change', inputChange);

function inputChange(){
    const files = dcmFile.files;
    //バッファを確保、その後2バイトでtag読み、あとは変調してバイト読み込み
    fileReader.readAsArrayBuffer(files[0]);//ここの反応によっていろんなイベントが発生する
    //↑のイベントの一部、ファイル読み込み後に発火するonload(もしくは'load')を使用。
    fileReader.addEventListener('load', function(e) {
        const dataViewer = new DataView(e.target.result);
        const imgInfo = getImageData(dataViewer, true, true);
        
        //ここはhtmlUI上で選択できるようにしたい
        let seekTag = [
            new Map([[0x0008, 0x0080]])
        ];
        const seekTagData = getTagInfo(dataViewer, seekTag);
        console.log(seekTagData.get("(0008,0080)"));
        console.log(seekTagData);

        let canvas = document.getElementById('imgView');
        canvas.width = imgInfo.get("width");
        canvas.height = imgInfo.get("height");
        let ctx = canvas.getContext('2d');
        // let img = setImage(ctx, imgInfo);
        // imgInfo.set("image", makeBinary(imgInfo.get("image"), 3515));
        let img = setImage(ctx, imgInfo);

        ctx.putImageData(img, 0, 0);
        console.log("image is displayed.")
    })

    //トリミング処理
    //複数のDICOMに対する処理
    //出力処理
}

//トーンカーブ
//rawデータはuint16(0~4095で12bitなのだが、byteで格納する都合により2byte=16bitで格納している)
//ディスプレイ上ではuint8(0 ~ 255)階調でしか表示できない
//そのため、ウィンドウ幅で調整して表示する部分を限定する
//そこでトーンカーブをもちいて表現する
//オートでウィンドウ調整したかったけどアイデアが思いつかなかった
function applyToneCurve(array1D, min, max) {
    let delta = 255 / (max - min)
    return array1D.map(v => Math.floor(delta * (v - min)));
}

function setImage(ctx, imgInfo) {
    let imgData = ctx.createImageData(imgInfo.get("width"), imgInfo.get("height"));
    // const displayData = applyToneCurve(imgInfo.get("image"), -120, 100);
    // const displayData = applyToneCurve(imgInfo.get("image"), 2000, 3500);
    const displayData = applyToneCurve(imgInfo.get("image"), 0, 4095);


    for (let data_i = 0, display_i = 0; data_i < imgData.data.length, display_i < displayData.length; data_i++, display_i++) {
        imgData.data[4 * data_i] = displayData[display_i];    //red
        imgData.data[4 * data_i + 1] = displayData[display_i];   //green
        imgData.data[4 * data_i + 2] = displayData[display_i];  //blue
        imgData.data[4 * data_i + 3] = 255                    //alpha
    }
    return imgData;
}


function getImageData(dataView, isInvert, isScaled) {
    // let readDict = new Map();
    let imgTags = [
        new Map([[0x0028,0x0010]]),//Rows
        new Map([[0x0028,0x0011]]),//Columns
        new Map([[0x0028,0x1052]]),//Rescale Intercept
        new Map([[0x0028,0x1053]]),//Rescale Slope
        new Map([[0x7FE0,0x0010]]), //Pixel Data
    ]
    const readDict = getTagInfo(dataView, imgTags);
    return new Map([
        ["height", readDict.get("(0028,0010)")],
        ["width", readDict.get("(0028,0011)")],
        ["image", isScaled ? imgMaker(readDict, isInvert) : isInvert ? readDict.get("(7fe0,0010)").map(v => 4095 - v) : readDict.get("(7fe0,0010)")]]);
}

function imgMaker(readDict, isInvert) {
    //スケーリングによって実数になると以下のコードは微妙かも
    const trueValue = readDict.get("(7fe0,0010)").map(v => v * Number(readDict.get("(0028,1053)")) + Number(readDict.get("(0028,1052)")));
    return isInvert ? trueValue.map(v=>4095-v) : trueValue
}

function getTagInfo(dataView, tagDict) {
    let resultDict = new Map();
    //検索アルゴリズムを変えられればもっと処理が早くなる
    //現段階では上から順に検索
    for (let offset = 0; offset < dataView.byteLength; offset+=2) {
        const currentGroup = dataView.getUint16(offset, true);
        if (tagDict.some(tag => tag.has(currentGroup))) {
            const currentElement = dataView.getUint16(offset+2, true);
            if(tagDict.some(tag => tag.get(currentGroup) === currentElement)){
                const currentTag =`(${('0000' + currentGroup.toString(16)).slice(-4)},${('0000' + currentElement.toString(16)).slice(-4)})`
                resultDict.set(currentTag, tagDataReader(dataView, offset+4));
            }
        }
    }
    return resultDict;
}

function tagDataReader(dataView, offset) {
    let dataLength = 0;
    let data;
    const VR = getUint8Array(dataView, offset, 4);
    //以下、データ型の追加がまだまだ必要。後々追加。
    switch (String.fromCharCode(VR[0])+String.fromCharCode(VR[1])) {
        case "DS":
            dataLength = VR[3] * 256 + VR[2];
            data = getUint8Array(dataView, offset + 4, dataLength);//ここもgetUint16Array?
            return data.map(v => String.fromCharCode(v)).join("");
        case "US":
            dataLength = VR[3] * 256 + VR[2];
            //データ型によってデータ中身の読み込み方法まで違う
            data = dataView.getUint16(offset+4, true);
            return data;
        case "LO":
            dataLength = VR[3] * 256 + VR[2];
            data = getUint8Array(dataView, offset + 4, dataLength);
            return data.map(v => String.fromCharCode(v)).join("");
        case "OW":
            //dataLengthBuffer(dLB)
            const dLB = getUint8Array(dataView, offset+4, 4);
            dataLength = dLB[3] * 256 ** 3 + dLB[2] * 256 ** 2 + dLB[1] * 256 + dLB[0];
            data = getUint16Array(dataView, offset + 8, dataLength);
            return data;  
        default:
            dataLength = VR[3] * 256 ** 3 + VR[2] * 256 ** 2 + VR[1] * 256 + VR[0];
            data = getUint8Array(dataView, offset + 4, dataLength);
            return data;
    }
}

function getUint8Array(dataView, offset, length){
    return Array.from(Array(length), (_v, k) => dataView.getUint8(offset+k, true))
}
//2byteずつ読むので配列の長さは半分になる
function getUint16Array(dataView, offset, length){
    return Array.from(Array(Math.floor(length/2)), (_v, k) => dataView.getUint16(offset+k*2, true))
}


//以下は画像処理ライブラリとして分離させる予定

//階調処理
//ヒストグラム
function histgram(array1D) {
    return array1D.reduce((prev, current) => {
        prev[current] = prev[current] ? prev[current]+1 : 1
        return prev
    }, {});
}

function makeBinary(array1D, threshHold) {
    return array1D.map(v =>v > threshHold ? 255 : 0);
}

function uniformArray(len, value) {
    let arr = new Array(len); for (let i = 0; i < len; ++i) arr[i] = Array.isArray(value) ? [...value] : value;
    return arr;
}

function conv2D(kernel, array2D) {
    //分かりやすいようあえて定義
    const kRows = kernel.length;
    const kCols = kernel[0].length;
    const rows = array2D.length;
    const cols = array2D[0].length;
    const kCenterX = Math.floor(kCols / 2);
    const kCenterY = Math.floor(kRows / 2);
    //要素がすべて０の2次元配列を生成
    let result = uniformArray(rows, uniformArray(cols, 0));


    for (let i = 0; i < rows; ++i) {          
        for (let j = 0; j < cols; ++j) {          
            for (let m = 0; m < kRows; ++m) {         
                for (let n = 0; n < kCols; ++n) {        
                    let ii = i + (m - kCenterY);
                    let jj = j + (n - kCenterX);
                    //array境界の外の計算は無視
                    if (ii >= 0 && ii < rows && jj >= 0 && jj < cols) {
                        result[i][j] += array2D[ii][jj] * kernel[m][n];
                    };
                };
            };
        };
    };
    return result;
};

function filter_Laplacian(imgInfo) {
    const kernel = [
        [1,1,1],
        [1,-8,1],
        [1,1,1]
    ];
    let imgArray2D = convertTo2D(imgInfo.get("image"), imgInfo.get("width"));
    let filterd = conv2D(kernel, imgArray2D);
    console.log("filter applied.");
    //もうすこしいい感じに書きたい
    return new Map([
        ["height", imgInfo.get("height")],
        ["width", imgInfo.get("width")],
        ["image", filterd.flat()]
    ]);
}

function filter_Sobel(imgInfo, isVertical) {
    const kernel = isVertical ? [
        [1, 2, 1],
        [0, 0, 0],
        [-1, 2, -1]
    ]:
    [
        [-1, 0, 1],
        [-2, 0, 2],
        [-1, 0, 1]
    ];
    let imgArray2D = convertTo2D(imgInfo.get("image"), imgInfo.get("width"));
    let filterd = conv2D(kernel, imgArray2D);
    console.log("filter applied.");
    //もうすこしいい感じに書きたい
    return new Map([
        ["height", imgInfo.get("height")],
        ["width", imgInfo.get("width")],
        ["image", filterd.flat()]
    ]);
}



function convertTo2D(array1D, spliceWidth) {
    const array2D = [];
    while (array1D.length)
        array2D.push(array1D.splice(0, spliceWidth));
    return array2D;
}


//ウィンドウ幅調節
//ガウシアンフィルタ
//2値化
//これが一番きれい
//回転を考慮しない外接矩形を求める

//DFT
//複素数演算の用意
const zero = () => [0, 0];
const expi = t => [Math.cos(t), Math.sin(t)];
const add = ([ax, ay], [bx, by]) => [ax + bx, ay + by];
const sub = ([ax, ay], [bx, by]) => [ax - bx, ay - by];
const mul = ([ax, ay], [bx, by]) => [ax*bx - ay*by, ax*by, + ay * bx];
const divr = ([ax, ay], r) => [ax / r, ay / r];
const abs = ([a, ib]) => [Math.sqrt(a ^ 2 + ib ^ 2)];


const v1mul = (a1d, b) => a1d.map(a => mul(a, b));
const v1add = (a1d, b1d) => a1d.map((a, i) => add(a, b1d[i])); 
const v1sub = (a1d, b1d) => a1d.map((a, i) => sub(a, b1d[i])); 
const v1sum = c1d => c1d.reduce(add, zero());
//転置
const transpose = c2d => c2d[0].map((_, j) => c2d.map((_, i) => c2d[i][j]));


//funcを生成するファクトリー関数
//アロー関数のふるまいに注意すれば混乱しないはず
//2要素の配列が戻り値である点に注意
//フーリエ変換とフーリエ逆変換を作成する
const dft2DMaker = dft2Dfunc => [
    c2d => dft2Dfunc(-2 * Math.PI, c2d),
    F2d => {
        const f2d = dft2Dfunc(2 * Math.PI, F2d);
        return f2d.map(c1d => c1d.map(c => divr(c, f2d.length * c1d.length)));
    },
];

const dft1DCore = (t, c1d) => c1d.map((_, index) => v1sum(
    c1d.map((c, i) => mul(c, expi(t * index * i / c1d.length)))));

//複素2次平面を転置して一行ずつフーリエ変換する
const dft2DCore = (t, c2d) => transpose(
    transpose(c2d.map(c1d => dft1DCore(t, c1d))).map(c1d => dft1DCore(t, c1d)));

const [dft2D, idft2D] = dft2DMaker(dft2DCore);
//高速フーリエ変換の実装は後々やる

function gaussProfMaker(FWHM, pixelSpacingArray) {
    const alpha = (4*Math.LN10(2))/(FWHM^2);
    return pixelSpacingArray.map(v=>Math.sqrt(alpha/Math.PI)*Math.exp(-alpha*v^2)); 
}

function filter2DMaker(profArray1D, height) {
    let copy1D = Array.from(Array(height), _=>profArray1D);
    let filter2D = copy1D*transpose(copy1D);
    return filter2D/total(filter2D);
}


function total() {
    return NaN;
}

function* range(start, end) {
    for (let i = start; i < end; i++) {
        yield i;
    }
}