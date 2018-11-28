'use strict'

const Web3Util = require('./web3')
const TokenHelper = require('./token')
const db = require('../models')

let AccountHelper = {
    getAccountDetail: async (hash) => {
        hash = hash.toLowerCase()
        let _account = await db.Account.findOne({ hash: hash })
        _account = _account || {}

        let web3 = await Web3Util.getWeb3()

        web3.eth.getBalance(hash, function (err, balance) {
            if (err) {
                console.error(err)
            } else {
                _account.balance = balance
                _account.balanceNumber = balance
            }
        })

        if (!_account.hasOwnProperty('code')) {
            let code = await web3.eth.getCode(hash)
            if (code !== '0x') {
                _account.isContract = true
            }
            _account.code = code
            _account.isToken = await TokenHelper.checkIsToken(code)
        }
        _account.status = true

        delete _account['_id']

        let acc = await db.Account.findOneAndUpdate({ hash: hash }, _account, { upsert: true, new: true })
        return acc
    },
    processAccount:async (hash) => {
        hash = hash.toLowerCase()
        try {
            let _account = await db.Account.findOne({ hash: hash })
            if (!_account) {
                _account = {}
            }

            let web3 = await Web3Util.getWeb3()

            web3.eth.getBalance(hash, function (err, balance) {
                if (err) {
                    console.error(err)
                } else {
                    _account.balance = balance
                    _account.balanceNumber = balance
                }
            })

            if (!_account.hasOwnProperty('code')) {
                let code = await web3.eth.getCode(hash)
                const q = require('../queues')
                if (code !== '0x') {
                    _account.isContract = true
                    // q.create('ContractProcess', { address: hash })
                    //     .priority('normal').removeOnComplete(true).save()
                }
                _account.code = code

                let isToken = await TokenHelper.checkIsToken(code)
                if (isToken) {
                    q.create('TokenProcess', { address: hash })
                        .priority('normal').removeOnComplete(true).save()
                }
                _account.isToken = isToken
            }

            _account.status = true

            delete _account['_id']

            await db.Account.updateOne({ hash: hash }, _account,
                { upsert: true, new: true })
        } catch (e) {
            console.error(e)
        }
    },
    async formatAccount (account) {
        // Find txn create from.
        let fromTxn = null
        account = account.toJSON()
        if (account.isContract) {
            let tx = await db.Tx.findOne({
                from: account.contractCreation,
                to: null,
                contractAddress: account.hash
            })
            if (tx) {
                fromTxn = tx.hash
            }
        }
        account.fromTxn = fromTxn

        // Get token.
        let token = null
        if (account.isToken) {
            token = await db.Token.findOne({ hash: account.hash })
        }
        account.token = token

        // Inject contract to account object.
        account.contract = await db.Contract.findOne({ hash: account.hash })

        // Check has token holders.
        let hasTokens = await db.TokenHolder.findOne({ hash: account.hash })
        account.hashTokens = !!hasTokens
        return account
    },

    async getCode (hash) {
        try {
            if (!hash) { return }
            hash = hash.toLowerCase()
            let code = ''
            let account = await db.Account.findOne({ hash: hash })
            if (!account) {
                let web3 = await Web3Util.getWeb3()
                code = await web3.eth.getCode(hash)
            } else {
                code = account.code
            }

            return code
        } catch (e) {
            console.trace(e)
            throw e
        }
    }
}

module.exports = AccountHelper
