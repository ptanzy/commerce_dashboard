import { buildDataIndex } from '../../src/data/indexes';
import type { DataManifest, ItemFact, OrderFact } from '../../src/domain/types';
import type { DashboardDataset } from '../../src/data/loader';

const orderBase: OrderFact = {
  orderId:'', customerState:'MG', purchaseDate:'2018-03-01',
  purchaseTimestamp:'2018-03-01T10:00:00', estimatedDeliveryDate:'2018-03-06',
  deliveredDate:'2018-03-05', deliveredTimestamp:'2018-03-05T10:00:00',
  status:'delivered', deliveryDays:4, deliveryDayDelta:-1,
  deliveryClassification:'early', itemCount:0,
};
export const orders: OrderFact[] = [
  {...orderBase,orderId:'multi',itemCount:2},
  {...orderBase,orderId:'single',customerState:'SP',purchaseDate:'2018-03-02',purchaseTimestamp:'2018-03-02T10:00:00',deliveredTimestamp:'2018-03-09T10:00:00',deliveredDate:'2018-03-09',deliveryDays:7,deliveryDayDelta:3,deliveryClassification:'late',itemCount:1},
  {...orderBase,orderId:'zero',customerState:'RJ',purchaseDate:'2018-03-03',purchaseTimestamp:'2018-03-03T10:00:00',estimatedDeliveryDate:null,deliveredDate:null,deliveredTimestamp:null,deliveryDays:null,deliveryDayDelta:null,deliveryClassification:'unknown',status:'canceled'},
];
export const items: ItemFact[] = [
  {orderId:'multi',orderItemId:1,sellerId:'seller-sp',sellerState:'SP',customerState:'MG',category:'health_beauty',priceBRL:100,freightChargeBRL:10},
  {orderId:'multi',orderItemId:2,sellerId:'seller-rj',sellerState:'RJ',customerState:'MG',category:'books',priceBRL:200,freightChargeBRL:40},
  {orderId:'single',orderItemId:1,sellerId:'seller-rj',sellerState:'RJ',customerState:'SP',category:'health_beauty',priceBRL:80,freightChargeBRL:12},
];
export const manifest: DataManifest = {
  schemaVersion:2,sourceName:'Olist Brazilian E-Commerce',sourceFiles:[],processingVersion:'test-fixture',
  purchaseDateMin:'2018-03-01',purchaseDateMax:'2018-03-03',orderCount:3,itemCount:3,
  unmatchedJoinCounts:{},invalidCounts:{},provenance:'synthetic test fixture',sampleMode:true,
};
export const dataset: DashboardDataset = {manifest,index:buildDataIndex(orders,items)};
