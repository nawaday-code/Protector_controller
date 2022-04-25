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



        // let canvas = document.getElementById('imgView');
        // canvas.width = imgInfo.get("width");
        // canvas.height = imgInfo.get("height");
        // let ctx = canvas.getContext('2d');
        // let img = setImage(ctx, imgInfo);
        // imgInfo.set("image", makeBinary(imgInfo.get("image"), 3515));
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

//処理方法を変える
/*
1. フィルターを用意
2. フィルターを転置する
3. imageをDFTする
4. フィルターをDFTする
5. DFTしたもの同士を掛ける
6. IDFTする
*/

const transpose = a => a[0].map((_, c) => a.map(r => r[c]));

async function asyncMul_Re(fn_Re, fn_Im, theta) {
    return fn_Re*Math.cos(theta) - fn_Im*Math.sin(theta);
}

async function asyncMul_Im(fn_Re, fn_Im, theta) {
    return fn_Re*Math.sin(theta) + fn_Im*Math.cos(theta);
}

async function asyncTotal(array1D){
    return array1D.reduce((sum, v)=> sum += v, 0);
}

async function asyncTotalDivLength(array1D){
    return array1D.reduce((sum, v)=> sum += v, 0) / array1D.length;
}


async function mappingColumn(func, real2D, imaginary2D) {
    const sampleCol = real2D.length;
    let mappingPromise = [];
    for (let i = 0; i < sampleCol; i++) {
        mappingPromise[i] = func(real2D[i], imaginary2D[i]);
    }

    return Promise.all(mappingPromise);
}

async function asyncDFT1D(real1D, imaginary1D) {

    if(real1D.length != imaginary1D.length){throw new Error('reject: 実部と虚部の要素数が一致しません');}
    const sampleN = real1D.length;

    let result_promise = [];
    for (let i = 0; i < sampleN; i++) {
        let innerFunc = [];
        for (let j = 0; j < sampleN; j++) {
            const theta = (-2 * Math.PI * i * j)/sampleN
            innerFunc[j]= Promise.all([asyncMul_Re(real1D[j], imaginary1D[j], theta), asyncMul_Im(real1D[j], imaginary1D[j], theta)]);
            
        }
        const pre_total =  await Promise.all(innerFunc);
        const [pre_total_Re, pre_total_Im] =  transpose(pre_total);
        result_promise[i] = Promise.all([asyncTotal(pre_total_Re), asyncTotal(pre_total_Im)]);
    }
    const result = await Promise.all(result_promise);
    const [resultRe, resultIm] = transpose(result);

    return [resultRe, resultIm];
}

async function asyncIDFT1D(real1D, imaginary1D) {

    if(real1D.length != imaginary1D.length){throw new Error('reject: 実部と虚部の要素数が一致しません');}
    const sampleN = real1D.length;

    let result_promise = [];
    for (let i = 0; i < sampleN; i++) {
        let innerFunc = [];
        for (let j = 0; j < sampleN; j++) {
            const theta = (2 * Math.PI * i * j)/sampleN
            innerFunc[j]= Promise.all([asyncMul_Re(real1D[j], imaginary1D[j], theta), asyncMul_Im(real1D[j], imaginary1D[j], theta)]);
            
        }
        const pre_total =  await Promise.all(innerFunc);
        const [pre_total_Re, pre_total_Im] =  transpose(pre_total);
        result_promise[i] = Promise.all([asyncTotalDivLength(pre_total_Re), asyncTotalDivLength(pre_total_Im)]);
    }
    const result = await Promise.all(result_promise);
    const [resultRe, resultIm] = transpose(result);

    return [resultRe, resultIm];
}

async function asyncDFT2D(real2D, imaginary2D) {
    if (real2D.length != imaginary2D.length || real2D[0].length != imaginary2D[0].length) {
        throw new Error('reject: 実部と虚部の行列数が一致しません');
    }
    const dft_axis0 = await mappingColumn(asyncDFT1D, real2D, imaginary2D);
    const [dft_axis0_T_Re, dft_axis0_T_Im] = transpose(dft_axis0);
    const dft_T = await mappingColumn(asyncDFT1D, transpose(dft_axis0_T_Re), transpose(dft_axis0_T_Im));
    const [dft_Re, dft_Im] = transpose(dft_T);

    return [dft_Re, dft_Im];
}

async function asyncIDFT2D(real2D, imaginary2D) {
    if (real2D.length != imaginary2D.length || real2D[0].length != imaginary2D[0].length) {
        throw new Error('reject: 実部と虚部の行列数が一致しません');
    }
    const idft_axis0 = await mappingColumn(asyncIDFT1D, real2D, imaginary2D);
    const [idft_axis0_T_Re, idft_axis0_T_Im] = transpose(idft_axis0);
    const idft_T = await mappingColumn(asyncIDFT1D, transpose(idft_axis0_T_Re), transpose(idft_axis0_T_Im));
    const [idft_Re, idft_Im] = transpose(idft_T);

    return [idft_Re, idft_Im];
}


async function asyncMulti2D(array2Da, array2Db) {
    if (array2Da.length != array2Db.length || array2Da[0].length != array2Db[0].length) {
        throw new Error('reject: 2つの行列の行列数が一致しません');
    }
    const columns = array2Da.length

    let resultPromise = [];
    for (let i = 0; i < columns; i++) {
        resultPromise[i] = asyncMulti1D(array2Da[i], array2Db[i]);
    }
    return Promise.all(resultPromise);
}

async function asyncMulti1D(array1Da, array1Db) {
    if (array1Da.length != array1Db.length) {
        throw new Error('reject: 配列の長さが一致しません');
    }
    const length = array1Da.length;

    let resultPromise = [];
    for (let i = 0; i < length; i++) {
        resultPromise[i] = asyncMulti(array1Da[i], array1Db[i]);
    }

    return Promise.all(resultPromise);
}

async function asyncMulti(a, b) {
    return a*b;
}

async function gaussProfMaker(pixelSpacingArray, FWHM) {
    const alpha = (4*Math.log10(2))/(FWHM**2);
    let gaussPromise = [];
    for (let i = 0; i < pixelSpacingArray.length; i++) {
        gaussPromise[i] = gaussfunc(pixelSpacingArray[i], alpha);
    }
    const gaussResult = await Promise.all(gaussPromise);
    
    return await normalize(gaussResult);
}

async function gaussfunc(value, alpha) {
    return Math.sqrt(alpha / Math.PI) * Math.exp(-alpha * value ** 2);
}

async function normalize(array1D) {
    const maxV = array1D.reduce((maxV, v)=>Math.max(maxV, v), -Infinity);
    let resultPromise = [];
    for (let i = 0; i < array1D.length; i++) {
        resultPromise[i] = asyncMulti(array1D[i], 1/maxV);
    }
    return Promise.all(resultPromise);
}

async function filterMaker2D(profArray1D, columns) {
    let duplicate = Array.from(Array(columns), _=>profArray1D);
    const filter2D = await asyncMulti2D(duplicate, transpose(duplicate));
    const normalized = await normalize(filter2D.flat());
    return convertTo2D(normalized, [profArray1D.length, columns]);
}

function convertTo2D(array1D, shape) {
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

//complexの分離と結合をやめる
//dftの引数を実部の２次元行列と虚部の2次元行列の2つにする


// async function gaussianFilter(imgInfo, FWHM) {
//     const image = imgInfo.get('image'), width = imgInfo.get('width'), height = imgInfo.get('height'), pixelSpacing = imgInfo.get('pixelSpacing')[0];
//     //pixelSpacingArrayの作成
//     // profileMtx = (float(x)*pixelSize for x in range(-int(mtx/2), int(mtx/2)))
//     //heightとwidthで大きいほうを選択
//     const arrayLength = width > height ? width : height;
//     const halfLength = Math.floor(arrayLength/2);
//     // const pixelSpacingArray = Array.from(Array(arrayLength), (_, k)=>k*imgInfo.get('pixelSpacing')[0]);
//     const pixelSpacingArray = Array.from(range(-halfLength + 1, halfLength), v => v * pixelSpacing);
//     // const testarray = Array.from(range(-halfLength, halfLength), v=> v);
//     // console.log(testarray);
//     //gaussianFilterの作成
//     let filter = await filterMaker(gaussProfMaker(pixelSpacingArray, FWHM), arrayLength);

//     //2次元複素データの用意
//     console.log("make complex");
//     let complex2D_p = convertTo2D(mergeToComplex(image), [height, width]);
//     let complexfilter_p = convertTo2D(mergeToComplex(filter), [arrayLength, arrayLength]);
//     const [complex2D, complexfilter] = await Promise.all([complex2D_p, complexfilter_p]);
//     console.log("maked complex");
//     //DFTしてフィルターの適応
//     // console.log(dft2D(complex2D).flat().map(v=> abs(v)).flat());
//     //分割代入
//     // let dftRe, dftIm
//     // let [dftRe, dftIm]= separateFromComplex(dft2D(complex2D));
//     // let [dftFilterRe, _dftFilterIm] = separateFromComplex(dft2D(complexfilter));
//     // await Promise.all([dftRe, dftIm], [dftFilterRe, _dftFilterIm]);
//     // const promiseRe = multiple2D(dftRe, dftFilterRe);
//     // const promiseIm = multiple2D(dftIm, dftFilterRe);
//     let dft_p = separateFromComplex(dft2D(complex2D));
//     let filterDft_p = separateFromComplex(dft2D(complexfilter));
//     console.log("dft running...");
//     const [dft, filterDft] = await Promise.all([dft_p, filterDft_p]);
//     let multiRe_p = multiple2D(dft[0], filterDft[0]);
//     let multiIm_p = multiple2D(dft[1], filterDft[1]);
//     console.log(multiRe_p);
//     const multiReIm = await Promise.all([multiRe_p, multiIm_p]);
//     const dftFilterd = mergeToComplex(multiReIm);
//     console.log("dft finished.");
//     console.log(dftFilterd);
//     // console.log(dftFilterd.flat().map(v=>Math.abs(v)));
//     // imgInfo.set("image", idft2D(dftFilterd).flat().map(v => Math.abs(v)));
//     // return imgInfo;
// }



// function total2D(array2D) {
//     return array2D.flat().reduce((sum, v)=>sum += v, 0);
// }

// function* range(start, end) {while (start <= end) {yield start++}}


// //実部と虚部を分けるmethod
// async function separateFromComplex(complex2D){
//     const rows = complex2D.length, columns = complex2D[0].length;
//     let real2D = Array.from(Array(rows), _=>Array.from(Array(columns), _=>0));
//     let imag2D = Array.from(Array(rows), _=>Array.from(Array(columns), _=>0));

//     for (let i = 0; i < rows; i++) {
//         for (let j = 0 ; j < columns; j++) {
//             real2D[i][j] = complex2D[i][j][0]
//             imag2D[i][j] = complex2D[i][j][1]
//         }
//     }
//     return [real2D, imag2D];
// }
// function mergeToComplex(real2D, imag2D) {
//     const rows = real2D.length, columns = real2D[0].length;
//     let complex2D = Array.from(Array(rows), _=>Array.from(Array(columns), _=>[0,0]));
//     if (imag2D == undefined) {
//         for (let i = 0; i < rows; i++) {
//             for (let j = 0; j < columns; j++) {
//                 complex2D[i][j][0] = real2D[i][j];
//             }
//         }
//     }else{
//         for (let i = 0; i < rows; i++) {
//             for (let j = 0; j < columns; j++) {
//                 complex2D[i][j][0] = real2D[i][j];
//                 complex2D[i][j][1] = imag2D[i][j];
//             }
//         }
//     }
//     return complex2D;
// }