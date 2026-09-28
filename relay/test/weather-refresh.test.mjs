import test from "node:test";
import assert from "node:assert/strict";
import {refreshGrowthWeatherLocation, buildGrowthWeatherResponse} from "../src/worker.mjs";

function database(row){
  return {prepare(sql){
    let args=[];
    return {bind(...values){args=values;return this;},async first(){return {...row};},async run(){
      if(sql.includes("daily_json = ?5")){
        for(const [key,index] of Object.entries({station_id:1,station_name:2,station_amedas_code:3,daily_json:4,normal_json:5,
          forecast_end_date:6,history_start_date:7,history_through:8,refreshed_at:9})) row[key]=args[index];
        row.status="ready";
      }else if(sql.includes("SET status = 'retry'")){throw new Error(args[3]);}
      else row.status="refreshing";
      return {meta:{changes:1}};
    }};
  }};
}
function fixtures(missing){
  const now=new Date(),today=new Date(now.getTime()+9*3600000).toISOString().slice(0,10);
  const date=offset=>new Date(Date.parse(today+"T00:00:00Z")+offset*86400000).toISOString().slice(0,10);
  const times=[today,date(1)].map(day=>day+"T00:00:00+09:00"),issue=new Date(now.getTime()-3600000).toISOString();
  const forecast=[{reportDatetime:issue,timeSeries:[]},{reportDatetime:issue,timeSeries:[
    {timeDefines:times,areas:[{area:{code:"070030"},weatherCodes:["100","100"]}]},
    {timeDefines:times,areas:[{area:{code:"36361",name:"若松"},tempsMax:["25","25"],tempsMin:missing?["",""]:["15","15"]}]}
  ]}];
  const past=date(-1),csv=past.replaceAll("-",",")+(missing?",20,,,8":",20,25,15,8");
  const parameters={T2M:{},ALLSKY_SFC_SW_DWN:{},CLRSKY_SFC_SW_DWN:{}};
  for(let hour=0;hour<24;hour++){
    const key=new Date(Date.parse(past+"T00:00:00+09:00")+hour*3600000).toISOString().slice(0,13).replace(/[-T]/g,"");
    parameters.T2M[key]=10+hour/2;parameters.ALLSKY_SFC_SW_DWN[key]=0.5;parameters.CLRSKY_SFC_SW_DWN[key]=1;
  }
  const nasa={header:{time_standard:"UTC",fill_value:-999},properties:{parameter:parameters},
    parameters:{T2M:{units:"C"},ALLSKY_SFC_SW_DWN:{units:"MJ/hr"},CLRSKY_SFC_SW_DWN:{units:"MJ/hr"}}};
  const met={properties:{meta:{updated_at:issue,units:{air_temperature:"celsius",cloud_area_fraction:"%"}},
    timeseries:Array.from({length:73},(_,hour)=>({time:new Date(Date.parse(times[0])+hour*3600000).toISOString(),
      data:{instant:{details:{air_temperature:18,cloud_area_fraction:50}}}}))}};
  return {today,past,forecast,csv,nasa,met};
}
test("relay refresh reads JMA extrema first, requests only needed providers, and restores JMA priority after a gap recovers",async()=>{
  const originalFetch=globalThis.fetch,calls=[];
  let fixture=fixtures(false);
  const row={location_key:"070000:070030",location_json:JSON.stringify({officeCode:"070000",forecastAreaCode:"070030",class20Code:"0720200"}),
    station_id:"s47570",station_amedas_code:"36361",requested_start_date:fixture.past,daily_json:"[]",normal_json:"{}"};
  const env={DB:database(row)};
  globalThis.fetch=async(url,init)=>{
    calls.push({url:String(url),init});
    if(String(url).includes("forecast/data")) return Response.json(fixture.forecast);
    if(String(url).includes("obsdl/show/table")){
      assert.deepEqual(JSON.parse(init.body.get("elementNumList")),[["201",""],["202",""],["203",""],["401",""]]);
      return new Response(fixture.csv);
    }
    if(String(url).includes("amedastable")) return Response.json({"36361":{lat:[37,29.3],lon:[139,54.6]}});
    if(String(url).includes("amedas/data/point")) return Response.json({});
    if(String(url).includes("power.larc")) return Response.json(fixture.nasa);
    if(String(url).includes("api.met.no")) return Response.json(fixture.met,{headers:{Expires:new Date(Date.now()+3600000).toUTCString()}});
    throw new Error("Unexpected fetch "+url);
  };
  try{
    let response=buildGrowthWeatherResponse(await refreshGrowthWeatherLocation(env,row.location_key));
    assert.equal(calls.length,2,"complete JMA data needs neither coordinates nor external providers");
    assert.ok(response.daily.every(day=>!day.fallbackUsed));
    calls.length=0;fixture=fixtures(true);
    response=buildGrowthWeatherResponse(await refreshGrowthWeatherLocation(env,row.location_key));
    assert.ok(calls.every(call=>!call.url.includes("power.larc")&&!call.url.includes("api.met.no")),"previous native JMA fields prevent external fallback");
    const past=response.daily.find(day=>day.date===fixture.past),today=response.daily.find(day=>day.date===fixture.today);
    // Saved native extrema are reusable. Delete them to verify the cold-gap path.
    assert.equal(past.minTemp,15);assert.equal(past.meanTemp,20);
    assert.equal(today.minTemp,15,"earlier JMA forecast outranks MET");
    row.daily_json="[]";row.normal_json="{}";calls.length=0;
    response=buildGrowthWeatherResponse(await refreshGrowthWeatherLocation(env,row.location_key));
    assert.equal(response.daily[0].fallbackProvider,"nasa-power");assert.equal(response.daily[0].meanTemp,20);
    assert.equal(response.daily[1].fallbackProvider,"met-no");assert.equal(response.daily[1].maxTemp,25);
    assert.equal(response.daily.at(-1).date,row.forecast_end_date);assert.equal(response.daily.length,3);
    assert.equal(response.normal.fallbackCache,undefined);
    fixture=fixtures(false);calls.length=0;
    response=buildGrowthWeatherResponse(await refreshGrowthWeatherLocation(env,row.location_key));
    assert.equal(calls.length,2);assert.ok(response.daily.every(day=>!day.fallbackUsed));
    assert.equal(response.daily[0].minTemp,15);assert.equal(response.daily[1].meanTemp,20);
  }finally{globalThis.fetch=originalFetch;}
});
