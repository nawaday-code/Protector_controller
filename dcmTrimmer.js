//＜＜注意＞＞デフォルトでは、
// C#のBinaryReader.ReadInt16()はリトルエンディアン、
// javascriptのDataView.gerInt16はビッグエンディアン
// DICOMのバイト配列はリトルエンディアン
// javascriptで読み込む際はgetInt16(_, true)
// 第二引数をtrueにしてリトルエンディアンで読み込むこと

//実はmapは処理速度が遅いみたい。forかfor of, またはreduceを使って書き換え

const fileReader = new FileReader();
const dcmFile = document.getElementById('dcmFile');
dcmFile.addEventListener('change', inputChange);

function inputChange(){
    const files = dcmFile.files;
    //バッファを確保、その後2バイトでtag読み、あとは変調してバイト読み込み
    fileReader.readAsArrayBuffer(files[0]);
    fileReader.addEventListener('load', function(e) {
        const dataViewer = new DataView(e.target.result);
        const imgInfo = getImageData(dataViewer, false, isScaled=true);

        //ここはhtmlUI上で選択できるようにしたい
        let seekTag = [
            new Map([[0x0008, 0x103E]]),
            new Map([[0x0028, 0x0030]])
        ];
        const seekTagData = getTagInfo(dataViewer, seekTag);

        //画像処理部分。後々スクリプト分ける。
        //以下非同期処理で



        let canvas = document.getElementById('imgView');
        canvas.width = imgInfo.get("width");
        canvas.height = imgInfo.get("height");
        let ctx = canvas.getContext('2d');
        // let img = setImage(ctx, imgInfo);
        // imgInfo.set("image", makeBinary(imgInfo.get("image"), 3515));
        gaussianFilter(imgInfo, FWHM=2).then(v=>console.log(v));
        // let img = setImage(ctx, imgInfo_gaussed);

        // ctx.putImageData(img, 0, 0);

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
    const displayData = applyToneCurve(imgInfo.get("image"), -120, 100);
    // const displayData = applyToneCurve(imgInfo.get("image"), 2000, 3500);
    // const displayData = applyToneCurve(imgInfo.get("image"), 0, 4095);


    for (let data_i = 0, display_i = 0; data_i < imgData.data.length, display_i < displayData.length; data_i++, display_i++) {
        imgData.data[4 * data_i] = displayData[display_i];    //red
        imgData.data[4 * data_i + 1] = displayData[display_i];   //green
        imgData.data[4 * data_i + 2] = displayData[display_i];  //blue
        imgData.data[4 * data_i + 3] = 255                    //alpha
    }
    return imgData;
}


function getImageData(dataView, isInvert, isScaled) {
    let imgTags = [
        new Map([[0x0028,0x0010]]),//Rows
        new Map([[0x0028,0x0011]]),//Columns
        new Map([[0x0028,0x0030]]),//Pixel Spacing
        new Map([[0x0028,0x1052]]),//Rescale Intercept
        new Map([[0x0028,0x1053]]),//Rescale Slope
        new Map([[0x7FE0,0x0010]]),//Pixel Data
    ]
    const readDict = getTagInfo(dataView, imgTags);
    return new Map([
        ["height", readDict.get("(0028,0010)")],
        ["width", readDict.get("(0028,0011)")],
        ["pixelSpacing", readDict.get("(0028,0030)")],
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
    return Array.from(Array(length), (_v, k)=> dataView.getUint8(offset+k, true));
}
//2byteずつ読むので配列の長さは半分になる
function getUint16Array(dataView, offset, length){
    return Array.from(Array(Math.floor(length/2)), (_v, k) => dataView.getUint16(offset+k*2, true));
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
    let imgArray2D = convertTo2D(imgInfo.get("image"), [imgInfo.get('height'), imgInfo.get('width')]);
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
    let imgArray2D = convertTo2D(imgInfo.get("image"),[imgInfo.get('height'), imgInfo.get('width')]);
    let filterd = conv2D(kernel, imgArray2D);
    console.log("filter applied.");
    //もうすこしいい感じに書きたい
    return new Map([
        ["height", imgInfo.get("height")],
        ["width", imgInfo.get("width")],
        ["image", filterd.flat()]
    ]);
}


//shape = [*, *]



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
const transpose = a => a[0].map((_, c) => a.map(r => r[c]));

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

const dft1DCore = (constValue, c1d) => c1d.map((_, index) => v1sum(
    c1d.map((c, i) => mul(c, expi(constValue * index * i / c1d.length)))));

//複素2次平面を転置して一行ずつフーリエ変換する
const dft2DCore = (constValue, c2d) => transpose(
    transpose(c2d.map(c1d => dft1DCore(constValue, c1d))).map(c1d => dft1DCore(constValue, c1d)));

const [dft2D, idft2D] = dft2DMaker(dft2DCore);
//高速フーリエ変換の実装は後々やる

function gaussProfMaker(pixelSpacingArray, FWHM) {
    const alpha = (4*Math.log10(2))/(FWHM**2);
    return normalize(pixelSpacingArray.map(v=>Math.sqrt(alpha/Math.PI)*Math.exp(-alpha*v**2))); 
}

// async function filter2DMaker(profArray1D, height) {
//     let duplicate = Array.from(Array(height), _=>profArray1D);
//     //行列の掛け算の実装
//     let filter2D = await multiple2D(duplicate, transpose(duplicate))
//     console.log(filter2D);
//     return convertTo2D(normalize(filter2D.flat()), profArray1D.length);
// }

// async function filter2DMaker(profArray1D, columns) {
//     let duplicate = Array.from(Array(columns), _=>profArray1D);
//     const shape = [columns, profArray1D.length]
//     let filter2D = await multiple2D(duplicate, transpose(duplicate));
//     return convertTo2D(normalize(filter2D.flat()), shape);
// }

async function filterMaker(profArray1D, columns) {
    let duplicate = Array.from(Array(columns), _=>profArray1D);
    let filter2D = await multiple2D(duplicate, transpose(duplicate));
    return normalize(filter2D.flat());
}

function normalize(array1D) {
    const maxV = array1D.reduce((maxV, v)=>Math.max(maxV, v), -Infinity);
    return array1D.map(v => v/maxV);
}

async function convertTo2D(array1D, shape) {
    try{
        let array2D = [], arraytmp = array1D.slice(0, array1D.length);
        if (shape[0]*shape[1] != array1D.length) {
            throw new Error('1次元配列に対して2次元配列変換後の行と列の数が不正です。');
        }
        while (arraytmp.length)
            array2D.push(arraytmp.splice(0, shape[1]));
        return array2D;

    }catch(e){
        console.error("エラー:", e.message);
    }

}

async function gaussianFilter(imgInfo, FWHM) {
    //pixelSpacingArrayの作成
    // profileMtx = (float(x)*pixelSize for x in range(-int(mtx/2), int(mtx/2)))
    //heightとwidthで大きいほうを選択
    const arrayLength = imgInfo.get('width') > imgInfo.get('height') ? imgInfo.get('width'):imgInfo.get('height');
    const halfLength = Math.floor(arrayLength/2);
    // const pixelSpacingArray = Array.from(Array(arrayLength), (_, k)=>k*imgInfo.get('pixelSpacing')[0]);
    const pixelSpacingArray = Array.from(range(-halfLength+1, halfLength), v=> v*(imgInfo.get('pixelSpacing')[0]));
    // const testarray = Array.from(range(-halfLength, halfLength), v=> v);
    // console.log(testarray);
    //gaussianFilterの作成
    let filter = await filterMaker(gaussProfMaker(pixelSpacingArray, FWHM), arrayLength);
    console.log(filter.length);
    console.log(arrayLength);
    console.log(pixelSpacingArray.length);
    //2次元複素データの用意
    const complex2D =  convertTo2D(imgInfo.get('image').map((v)=>[v,0]), [imgInfo.get('height'), imgInfo.get('width')]);
    const complexfilter = convertTo2D(filter.map((v)=>[v,0]), [arrayLength, arrayLength]);
    await Promise.all(complex2D, complexfilter);
    //DFTしてフィルターの適応
    // console.log(dft2D(complex2D).flat().map(v=> abs(v)).flat());
    //分割代入
    // let dftRe, dftIm
    let [dftRe, dftIm]= separateFromComplex(dft2D(complex2D));
    let [dftFilterRe, _dftFilterIm] = separateFromComplex(dft2D(complexfilter));
    await Promise.all([dftRe, dftIm], [dftFilterRe, _dftFilterIm]);
    const promiseRe = multiple2D(dftRe, dftFilterRe);
    const promiseIm = multiple2D(dftIm, dftFilterRe);
    let dftFilterd = mergeToComplex(await Promise.all(promiseRe, promiseIm));
    console.log(dftFilterd);
    // console.log(dftFilterd.flat().map(v=>Math.abs(v)));
    // imgInfo.set("image", idft2D(dftFilterd).flat().map(v => Math.abs(v)));
    // return imgInfo;
}

async function asyncMulti(a, b) {
    return a*b;
}

async function multiple2D(a2D, b2D) {
    const rows = a2D.length, columns = a2D[0].length;

    let result2D = Array.from(Array(rows), _=>Array.from(Array(columns), _=>0));
    //非同期反復処理
    for (let i = 0; i < rows; i++) {
        for (let j = 0 ; j < columns; j++) {
            asyncMulti(a2D[i][j], b2D[i][j]).then(v=>result2D[i][j]=v);
        }
    }

    return await Promise.all(result2D);
}

function total2D(array2D) {
    return array2D.flat().reduce((sum, v)=>sum += v, 0);
}

function* range(start, end) {while (start <= end) {yield start++}}


//実部と虚部を分けるmethod
async function separateFromComplex(complex2D){
    const rows = complex2D.length, columns = complex2D[0].length;
    let real2D = Array.from(Array(rows), _=>Array.from(Array(columns), _=>0));
    let imag2D = Array.from(Array(rows), _=>Array.from(Array(columns), _=>0));

    for (let i = 0; i < rows; i++) {
        for (let j = 0 ; j < columns; j++) {
            real2D[i][j] = complex2D[i][j][0]
            imag2D[i][j] = complex2D[i][j][1]
        }
    }
    return [real2D, imag2D];
}
function mergeToComplex(real2D, imag2D) {
    const rows = real2D.length, columns = real2D[0].length;
    let complex2D = Array.from(Array(rows), _=>Array.from(Array(columns), _=>[0,0]));
    
    for (let i = 0; i < rows; i++) {
        for (let j = 0 ; j < columns; j++) {
            complex2D[i][j][0] = real2D[i][j];
            complex2D[i][j][1] = imag2D[i][j];
        }
    }
    return complex2D;
}