import {
  showToast,
  showModal,
  showLoading,
  hideLoading
} from "../../utils/asyncWX.js";
import {
  CanI
} from "../accessControl/operation.js";
import {
  getId
} from "../id/operation.js";
// 初始化云环境
const db = wx.cloud.database({
  env: "cloud1-6g50yxrq34ead3d9",
});
const goodsRef = db.collection("goods");
const _ = db.command;

// 将商品图片上传到云端
async function uploadGoodsPicCloud(goodsInfo) {
  // 将商品图片上传到云端并拿到云端的地址 云端的图片的命名为当前毫秒时间戳的字符串
  const res = await wx.cloud.uploadFile({
    cloudPath: "shopId_" + goodsInfo.shopId + "/" + "cateId_" + goodsInfo.cateId + "/" + Date.now().toString() + ".jpg",
    filePath: goodsInfo.goodsPicUrl, // 文件路径
  });
  return res;
}

// 检查商品数据的合法性
async function verifyGoodsInfo(goodsInfo) {
  // ====== 商品图片检查 ======
  if (!goodsInfo.goodsPicUrl) {
    await showToast("请添加商品图片");
    return;
  }

  // ====== 商品名称检查 ======
  if (!goodsInfo.goodsName.trim()) {
    await showToast("请添加商品名称");
    return;
  }

  // ====== 库存数量检查 ======
  // 要求: 0 <= 库存数量 <= 999
  // 如果库存量设置为0则自动设置goodsAbaliable为false

  if (!goodsInfo.goodsStock.trim()) {
    await showToast("请添加库存数量");
    return;
  }

  const goodsStock = Number(goodsInfo.goodsStock);

  if (isNaN(goodsStock)) {
    await showToast("库存量需为数字");
    return;
  }

  if (goodsStock < 0 || goodsStock > 9999) {
    await showToast("库存数量需介于0-9999");
    return;
  }

  // ====== 商品价格检查 ======
  // 要求:商品价格 >= 0 <=99999 且最多两位小数
  if (!goodsInfo.goodsPrice.trim()) {
    await showToast("请添加商品价格");
    return;
  }

  const goodsPrice = Number(goodsInfo.goodsPrice);

  if (isNaN(goodsPrice)) {
    await showToast("商品价格需为数字");
    return;
  }

  if (goodsPrice < 0 || goodsPrice > 999999) {
    await showToast("商品价格需介于0-999999");
    return;
  }

  if (String(goodsPrice).indexOf(".") + 1 > 0 && goodsPrice.toString().split(".")[1].length > 2) {
    await showToast("商品价格最多两位小数");
    return;
  }

  // ====== 最多购买量检查 ======
  // 要求: 0<最多购买量<9999
  if (!goodsInfo.goodsBuyLimit.trim()) {
    await showToast("请添加每单最多购买量");
    return;
  }

  const goodsBuyLimit = Number(goodsInfo.goodsBuyLimit);

  if (isNaN(goodsBuyLimit)) {
    await showToast("最多购买量需为数字");
    return;
  }

  if (goodsBuyLimit < 0 || goodsBuyLimit > 9999) {
    await showToast("每单最多购买量需介于0-9999");
    return;
  }

  // ====== 最少购买量检查 ======
  // 要求: 0 < 最少购买量 <= 999
  if (!goodsInfo.goodsBuyLeastLimit.trim()) {
    await showToast("请添加每单最少起购量");
    return;
  }

  const goodsBuyLeastLimit = Number(goodsInfo.goodsBuyLeastLimit);

  if (isNaN(goodsBuyLeastLimit)) {
    await showToast("最少购买量需为数字");
    return;
  }

  if (goodsBuyLeastLimit < 1 || goodsBuyLeastLimit > 9999) {
    await showToast("最少购买量需介于1-9999");
    return;
  }

  // 商品详情检查
  // 要求:可以为空
  if (!goodsInfo.goodsDetail.trim()) {
    const res = await showModal("提示","未填写商品详情");
    if (res.cancel) {
      return;
    }
  }
  // 将检查后的商品信息进行组装
  goodsInfo["goodsStock"] = goodsStock;
  goodsInfo["goodsPrice"] = goodsPrice;
  goodsInfo["goodsBuyLimit"] = goodsBuyLimit;
  goodsInfo["goodsBuyLeastLimit"] = goodsBuyLeastLimit;

  return goodsInfo;
}

// 添加新商品到云端
async function addGoodsCloud(goodsInfo) {
  if (!(await CanI("goods"))) {
    console.log("无操作权限");
    return;
  }
  // 检查用户输入的商品信息的合法性
  goodsInfo = await verifyGoodsInfo(goodsInfo);

  // 如果存在不合法商品信息则直接return
  if (!goodsInfo) {
    console.log("商品含有非法数据");
    return;
  }

  const modal = await showModal("确定保存?");
  if (modal.cancel) {
    return;
  }

  try {
    await showLoading("保存中");

    // 给商品信息加上系统属性
    goodsInfo["isExist"] = true;
    goodsInfo["goodsId"] = getId();
    goodsInfo["goodsAvailable"] = goodsInfo.goodsStock >= goodsInfo.goodsBuyLeastLimit;
    // 将商品图片上传到云端
    const res = await uploadGoodsPicCloud(goodsInfo);
    // 拿到图片的实际云存储地址
    const goodsPicUrlCloud = res.fileID;
    console.log("上传图片成功");

    goodsInfo["goodsPicUrl"] = goodsPicUrlCloud;

    console.log("goodsInfo", goodsInfo);

    // 将商品信息上传到云端
    console.log("正在上传商品信息");
    const res2 = await goodsRef.add({
      data: {
        ...goodsInfo
      },
    });

    await showModal("保存成功");
    return res2;
  } catch (error) {
    console.log("error", error);
    showModal("错误", "请检查网络状态后重试");
    return false
  } finally {
    hideLoading();
  }
}

// 比较两个商品的商品信息是否相同
function isGoodsEqual(goodsInfoA, goodsInfoB) {
  /* 
  1. 考虑过通过Object.getOwnPropertyNames()将对象转换成数组 再对数组进行比较 
    但是如果对象的一个属性又是一个对象则此办法失效
    而且对象的属性是无序的，转换成数组无法保证相同属性位于数组的相同索引
  2. 考虑过引入underscore.js或者lodash.js的_isEqual()方法进行比较 但是这两个包略大
  3. 考虑到目前的商品属性还算少，就暴力比较吧

  设计这个函数主要是为了在updateGoods()检查用户是否对商品基本信息做了修改 
  所以只检查goodsPicUrl, goodsName, goodsStock, goodsDetail, goodsBuyLimit, goodsBuyLeastLimit, goodsPrice
  */

  if (goodsInfoA.goodsPicUrl !== goodsInfoB.goodsPicUrl) {
    return false;
  }
  if (goodsInfoA.goodsName !== goodsInfoB.goodsName) {
    return false;
  }
  if (goodsInfoA.cateId !== goodsInfoB.cateId) {
    return false;
  }
  if (goodsInfoA.goodsStock !== goodsInfoB.goodsStock) {
    return false;
  }
  if (goodsInfoA.goodsDetail !== goodsInfoB.goodsDetail) {
    return false;
  }
  if (goodsInfoA.goodsBuyLimit !== goodsInfoB.goodsBuyLimit) {
    return false;
  }
  if (goodsInfoA.goodsBuyLeastLimit !== goodsInfoB.goodsBuyLeastLimit) {
    return false;
  }
  if (goodsInfoA.goodsPrice !== goodsInfoB.goodsPrice) {
    return false;
  }
  return true;
}

// 更新商品信息
/**
 * @
 * @param {*} goodsInfoNew 新的商品信息
 * @param {*} goodsInfoOld 旧的商品信息
 * @abstract 这里要求传入新旧商品信息是为了检查是不是真的有信息需要更新 不然会浪费很多数据库资源
 *
 */
async function updateGoodsCloud(goodsInfoNew, goodsInfoOld) {
  if (!(await CanI("goods"))) {
    console.log("无操作权限");
    return;
  }
  // 检查新商品信息的合法性
  goodsInfoNew = await verifyGoodsInfo(goodsInfoNew);

  // 如果存在不合法商品信息则直接return
  if (!goodsInfoNew) {
    console.log("商品含有非法数据");
    return;
  }

  console.log("updateGoods-isGoodsEqual");
  // 检查新旧商品信息是否相同
  const isEqual = isGoodsEqual(goodsInfoNew, goodsInfoOld);
  if (isEqual) {
    // 新旧商品信息相同 直接返回上一页
    wx.navigateBack({
      delta: 1,
    });
    return;
  }

  // 再通过cateId是否改变来判断是否需要重新赋值goodsOrder
  if (goodsInfoNew.cateId !== goodsInfoOld.cateId) {
    goodsInfoNew.goodsOrder = 0;
  }

  const res = await showModal("确定保存?");
  if (res.cancel) {
    return;
  }

  try {
    await showLoading("保存中");

    // 检查是否更换了商品图片。如果是则需要重新上传图片到云端
    const isGoodsPicChange = goodsInfoNew.goodsPicUrl !== goodsInfoOld.goodsPicUrl;
    if (isGoodsPicChange) {
      // TODO 删除和上传新的图片要做成一个事务
      console.log("检测到商品图片发生改变");

      // 上传新图片
      // 遇到一个天坑:这里之所以没有直接对旧图进行覆盖写是因为覆盖写之后重新拉取数据依旧展示的是旧图片
      // 然而图片其实确实被覆盖了，但是有缓存，要一段时间才能改过来。用自己服务器这样上传的话，也有这问题，所以只好重新上传新图片然后再删掉旧图，才可以做到改了以后马上生效
      const upLoadGoodsPicRes = await wx.cloud.uploadFile({
        cloudPath: "shopId_" + goodsInfoOld.shopId + "/" + "cateId_" + goodsInfoOld.cateId + "/" + Date.now().toString() + ".jpg",
        filePath: goodsInfoNew.goodsPicUrl, // 文件路径
      });

      // 拿到图片的实际云存储地址 更新goodsInfoNew中的图片地址为云文件地址
      console.log("上传新图片成功");
      const goodsPicUrlCloud = upLoadGoodsPicRes.fileID;
      goodsInfoNew["goodsPicUrl"] = goodsPicUrlCloud;
    }

    // TODO 将商品信息上传到云端  也是需要解决事务问题
    console.log("正在上传商品信息");
    goodsInfoNew["goodsAvailable"] = goodsInfoNew.goodsStock >= goodsInfoNew.goodsBuyLeastLimit;
    console.log("goodsInfoNew", goodsInfoNew);
    const upLoadNewGoodsInfoRes = await goodsRef
      .where({
        goodsId: goodsInfoOld.goodsId,
      })
      .update({
        data: {
          ...goodsInfoNew
        },
      });

    // 如果图片改过了 则将原图删除
    if (isGoodsPicChange) {
      // 删除原来的商品图片
      const deleteOldGoodsPicRes = await wx.cloud.deleteFile({
        fileList: [goodsInfoOld.goodsPicUrl],
      });
      console.log("删除并上传结果", deleteOldGoodsPicRes);
    }

    await showModal("保存成功");
    return upLoadNewGoodsInfoRes;
  } catch (error) {
    console.log("error", error);
    showModal("错误", "请检查网络状态后重试");
    return false
  } finally {
    hideLoading();
  }

}

// 从云端删除单个商品 这里的删除仅仅是虚拟删除
async function removeGoodsCloud(goodsInfo) {
  if (!(await CanI("goods"))) {
    console.log("无操作权限");
    return;
  }

  try {
    console.log("正在删除商品信息");
    await showLoading("删除中");
    const res = await goodsRef.where({
      goodsId: goodsInfo.goodsId
    }).update({
      data: {
        isExist: false
      },
    });
    console.log("删除完成", res);
    return res;
  } catch (error) {
    console.log("error", error);
    showModal("错误", "请检查网络状态后重试");
    return false
  } finally {
    hideLoading();
  }

}

// 从云端批量删除商品
async function removeManyGoodsCloud(goodsInfoList) {
  if (!(await CanI("goods"))) {
    console.log("无操作权限");
    return;
  }
  if (goodsInfoList.length === 1) {
    const res = await removeGoodsCloud(goodsInfoList[0]);
    return res;
  } else {
    let goodsIdList = goodsInfoList.map((v) => {
      return v.goodsId;
    });

    try {
      console.log("正在批量删除商品信息");
      await showLoading("删除中");
      const res = await goodsRef
        // TODO 在这里加入对shopId的限制可以缩小查找范围
        .where({
          goodsId: _.in(goodsIdList),
        })
        .update({
          data: {
            isExist: false
          },
        });
      console.log("删除完成", res);
      return res;
    } catch (error) {
      console.log("error", error);
      showModal("错误", "请检查网络状态后重试");
      return false
    } finally {
      hideLoading();
    }
  }
}

// 将商品上架
async function enableSaleCloud(goodsInfo) {
  if (!(await CanI("goods"))) {
    console.log("无操作权限");
    return;
  }
  if (goodsInfo.goodsStock === 0) {
    await showModal("错误", "库存为0 无法上架");
    return;
  }

  if (goodsInfo.goodsStock < goodsInfo.goodsBuyLeastLimit) {
    await showModal("错误", "库存少于最少起购量 无法上架");
    return;
  }

  try {
    showLoading("上架中");
    const res = await goodsRef.where({
      goodsId: goodsInfo.goodsId
    }).update({
      data: {
        goodsAvailable: true
      },
    });
    console.log("await res", res);

    return res;
  } catch (error) {
    console.log("error", error);
    showModal("错误", "请检查网络状态后重试");
    return false
  } finally {
    hideLoading();
  }


  // await showLoading("上架中");
  // console.log("update开始");

  // const res = goodsRef.where({ goodsId: goodsInfo.goodsId }).update({
  //     data: { goodsAvailable: true },
  //   })
  //   .then(res => {
  //     console.log("then的res",res)
  //     return res
  //   })
  //   .catch(res => {
  //     console.log("catch",res)
  //     showModal("错误","请检查网络状态后重试");
  //   })
  //   .finally(() => {
  //     console.log("finally")
  //     hideLoading();
  //   });
  //   console.log("外部res",res);

  //   return res
}

// 将商品下架
async function disableSaleCloud(goodsInfo) {
  if (!(await CanI("goods"))) {
    console.log("无操作权限");
    return;
  }
  try {
    await showLoading("下架中");
    const res = await goodsRef.where({
      goodsId: goodsInfo.goodsId
    }).update({
      data: {
        goodsAvailable: false
      },
    });
    return res;
  } catch (error) {
    console.log("error", error);
    showModal("错误", "请检查网络状态后重试");
    return false
  } finally {
    hideLoading();
  }
}

/**
 * 修改商品在当前分类下的展示顺序
 * @param goodsInfoList 一个对象数组，每个对象至少需要含有goodsId和goodsOrder
 */
async function reSortGoods(goodsInfoList) {
  try {
    await showLoading("保存中");
    goodsInfoList.forEach((v) => {
      goodsRef
        .where({
          goodsId: v.goodsId,
        })
        .update({
          data: {
            goodsOrder: v.goodsOrder,
          },
        });
    });
    return res;
  } catch (error) {
    console.log("error", error);
    showModal("错误", "请检查网络状态后重试");
    return false
  } finally {
    hideLoading();
  }
}

/**
 * 修改商品类别的展示顺序
 * @param goodsList 一个对象数组，包含需要修改的所有分类排序信息
 */
async function updateGoodsOrder(goodsList) {
  if (!(await CanI("goods"))) {
    console.log("无操作权限");
    return;
  }
  console.log("正在更新排序信息");

  try {
    await showLoading("正在保存");
    console.log("更改信息", goodsList);
    const updateRes = await wx.cloud.callFunction({
      name: "update_goods_order",
      data: {
        goodsList: goodsList,
      },
    });
    console.log("排序保存完成", updateRes);
    return updateRes;
  } catch (error) {
    console.log("error", error);
    showModal("错误", "请检查网络状态后重试");
    return false
  } finally {
    hideLoading();
  }

}

export {
  addGoodsCloud,
  removeManyGoodsCloud,
  updateGoodsCloud,
  enableSaleCloud,
  disableSaleCloud,
  verifyGoodsInfo,
  updateGoodsOrder
};