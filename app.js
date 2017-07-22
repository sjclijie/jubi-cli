'use strict';

const urllib = require( "urllib" );
const fs     = require( "fs" );
const _      = require( "underscore" );
const util   = require( "util" );
const moment = require( "moment" );
const Table  = require( "tty-table" );
const config = require( "./config" );
require( "chalk" );

const LOGIN_API   = 'https://www.jubi.com/ajax/user/login';
const FINANCE_API = 'https://www.jubi.com/ajax/user/finance';
const CONINS_API  = 'https://www.jubi.com/coin/allcoin';
const TRENDS_API  = 'https://www.jubi.com/coin/trends';
const COST_API    = 'https://www.jubi.com/ajax/trade/order/coin/%s?p=1&pagesize=100';
const COOKIE_JAR  = './cookie';


class Jubi {
    
    constructor() {
        this.cost = {};
        
        this.table_header = [
            {
                value      : "名称",
                align      : 'center',
                headerAlign: "center",
            },
            {
                value      : "数量",
                align      : 'center',
                headerAlign: "center",
            },
            {
                value      : "当前价",
                align      : 'center',
                headerAlign: "center",
            },
            {
                value      : "成本价",
                align      : 'center',
                headerAlign: "center",
            },
            {
                value      : "今日涨幅",
                align      : 'center',
                headerAlign: "center",
                formatter  : function ( val ) {
                    if (val == 0) {
                        return '-';
                    }
                    return `${val}%`;
                }
            },
            {
                value      : "今日盈亏",
                align      : 'center',
                headerAlign: "center",
            },
            {
                value      : "总盈亏",
                align      : 'center',
                headerAlign: "center",
            },
            {
                value      : "盈亏比例",
                align      : 'center',
                headerAlign: "center",
                formatter  : function ( val ) {
                    if (val == 0) {
                        return '-';
                    }
                    return `${val}%`;
                }
            },
        ];
        
        this.table_settings = {
            borderStyle  : 1,
            paddingBottom: 0,
            paddingLeft  : 2,
            paddingRight : 1,
            headerAlign  : "right",
            align        : "center",
            color        : "white"
        };
        
        //清屏
        console.log( "\x1b[2J" );
    }
    
    async run() {
        
        console.log( "\x1b[0;0H" );
        
        this.clearAndConsole( "开始..." );
        
        if (fs.existsSync( COOKIE_JAR )) {
            this.cookie = fs.readFileSync( COOKIE_JAR, "utf-8" );
        } else {
            await this.login()
        }
        
        let data = this.format( await this.finance() );
        
        this.render( data );
    }
    
    async request( url, method, data ) {
        
        this.clearAndConsole( `获取数据: [${url}]` );
        
        let dataType = "json";
        let headers  = {
            "User-Agent": "Jubi_iPhone_V1.9.8.7",
        };
        
        if (this.cookie) {
            headers["Cookie"] = this.cookie;
        }
        
        try {
            return await urllib.request( url, {
                headers,
                method,
                dataType,
                data
            } );
            
        } catch (e) {
            this.clearAndConsole( `获取数据数据失败: [${url}], 重试` );
            await this.request( url, method, data );
        }
    }
    
    async login() {
        
        let result = await this.request( LOGIN_API, 'POST', config );
        
        if (result.data.status == 1) {
            this.cookie = result.res.headers["set-cookie"];
            fs.writeFileSync( COOKIE_JAR, this.cookie );
        } else {
            this.clearAndConsole( `登入失败[${result.data.msg}]` );
            await this.login();
        }
    }
    
    async getCost( coin_name ) {
        
        if (!this.cost[coin_name]) {
            let url = util.format( COST_API, coin_name );
            
            let result = await this.request( url, "GET" );
            
            //let records = result.data.data.datas.filter( item => item.c > moment( "2017-07-10" ).format( "X" ) );
            let records = result.data.data.datas;
            
            let total_nums = records.reduce( ( a, b ) => {
                if (b.t == "买入") {
                    return a + b.n
                } else {
                    return a - b.n
                }
            }, 0 );
            
            let total_money = records.reduce( ( a, b ) => {
                if (b.t == "买入") {
                    return a + b.s
                } else {
                    return a - b.s
                }
            }, 0 );
            
            let cost_price = parseFloat( (total_money / total_nums).toFixed( 2 ), 2 );
            
            this.cost[coin_name] = cost_price;
        }
        
        return this.cost[coin_name];
    }
    
    async finance() {
        
        this.clearAndConsole( "开始获取数据" );
        
        let finance = await this.request( FINANCE_API, "GET" );
        let coins   = await this.request( `${CONINS_API}?t=${moment().format( "x" )}`, "GET" );
        let trends  = await this.request( `${TRENDS_API}?t=${moment().format( "x" )}`, "GET" );
        
        if (finance.data.status != 1) {
            throw new Error( "获取数据失败" );
        }
        
        let my_coins  = {};
        let all_coins = {};
        let result    = [];
        
        let suffix_flag = ["balance", "lock", "rate"];
        
        //获取持有的币
        for (let key of Object.keys( finance["data"]["data"] )) {
            for (let flag of suffix_flag) {
                if (key.endsWith( flag )) {
                    let name = key.substring( 0, key.length - flag.length - 1 );
                    if (!my_coins[name]) {
                        my_coins[name] = {};
                    }
                    my_coins[name][flag] = finance["data"]["data"][key];
                    break;
                }
            }
        }
        
        //获取价格信息
        for (let coin_name of Object.keys( coins["data"] )) {
            
            let coin  = coins["data"][coin_name];
            let trend = trends["data"][coin_name];
            
            all_coins[coin_name] = {
                "name"      : coin[0],
                "price"     : coin[1],
                "max_price" : coin[4],
                "min_price" : coin[5],
                "today_rate": (coin[1] - trend["yprice"]) / trend["yprice"]
            };
        }
        
        //过滤
        for (let coin_name of Object.keys( my_coins )) {
            if (all_coins[coin_name] && all_coins[coin_name]["price"]) {
                let coin_price = all_coins[coin_name]["price"];
                if (coin_price * my_coins[coin_name]["balance"] > 5) {
                    result.push( {
                        balance   : my_coins[coin_name]["balance"],
                        name      : all_coins[coin_name]["name"],
                        price     : all_coins[coin_name]["price"],
                        max_price : all_coins[coin_name]["max_price"],
                        min_price : all_coins[coin_name]["min_price"],
                        today_rate: parseFloat( (all_coins[coin_name]["today_rate"] * 100).toFixed( 2 ) ),
                        cost_price: await this.getCost( coin_name )
                    } );
                }
            }
        }
        
        return result;
    }
    
    format( data ) {
        
        let rows = [];
        
        for (let coin of data) {
            
            let today_profit = parseFloat( ( coin["price"] * coin["today_rate"] / 100 * coin["balance"] ).toFixed( 0 ) );
            
            let total_profit = parseFloat( ((coin["price"] - coin["cost_price"]) * coin["balance"]).toFixed( 0 ) );
            
            if (total_profit < today_profit) {
                today_profit = total_profit;
            }
            
            let profit_rate = parseFloat( ((coin["price"] - coin["cost_price"] ) / coin["cost_price"] * 100 ).toFixed( 4 ) );
            
            rows.push( [coin["name"], coin["balance"], coin["price"], coin["cost_price"], coin["today_rate"], today_profit, total_profit, profit_rate] );
        }
        
        return rows;
    }
    
    render( rows ) {
        
        this.clearAndConsole( "开始render数据..." );
        
        let table = Table( this.table_header, rows, this.table_settings );
        
        console.log( table.render() );
    }
    
    clearAndConsole( str ) {
        console.log( "\x1b[0;0H" );
        console.log( `\x1b[K${str}` );
    }
}


let jubi = new Jubi();

setInterval( async function () {
    
    try {
        await jubi.run();
    } catch (e) {
        jubi.clearAndConsole( e.message )
    }
    
}, 5000 );

