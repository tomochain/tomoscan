import config from 'config'
import express from 'express'
import _ from 'lodash'
import db from '../models'
import BlockHelper from '../helpers/block'

// Constants, should also be globally-available
const ADDR_LENGTH = 20
const EPOC = config.get('BLOCK_PER_EPOCH')
const DEFAULT_ERROR = { code: 406, message: 'Something went wrong' }

/**
 * ErrorHandler, considering separation for global use
 * @param {function} func - main async function of API
 * @param {defaultError} null - default-error object/function to handle err in replacement of try/catch
 * @returns {} switch to express-error-handling-middleware if defaultError not provided
 */
const handler = (func, defaultError = null) => (req, res, next) => func(req, res).catch(error => {
    console.trace(error)
    console.log(error)
    if (!defaultError) return next(error)
    if (typeof defaultError === 'function') return defaultError(res, error)
    return next(defaultError)
})

// Helper function
const bytesToAddress = bytes => {
    const countAddress = bytes.length / ADDR_LENGTH
    const sliced = _.map(_.range(countAddress), (__, i) => bytes.slice(i * 20, (i + 1) * 20))
    const addressList = _.map(sliced, a => `0x${a.toString('hex')}`)
    return addressList
}

const getM1M2List = async block => {
    const signers = _.get(await db.BlockSigner.findOne({ blockNumber: block.number }), '_doc.signers')
    return signers
}

const getRewardList = async epocBlock => {
    const fields = 'epoch endBlock address validator reason lockBalance reward'
    const rewards = _.map(await db.Reward.find({ endBlock: epocBlock.number }, fields), q => q._doc)
    const grouping = _.groupBy(rewards, 'reason')
    return grouping
}

// API Handlers
const GET_EPOCS = async (req, res, next) => {
    const blocksPerPage = Math.min(25, _.toInteger(req.query.limit)) || 10
    const currentPage = _.toInteger(req.query.page) || 1

    const latestBlockInDB = await db.Block.findOne({}).sort({ field: 'asc', _id: -1 }).limit(1)
    const realTotal = _.get(latestBlockInDB, 'number')
    const allEpochs = _.range(EPOC, realTotal, EPOC).reverse()
    const paging = _.slice(allEpochs, (currentPage - 1) * blocksPerPage, currentPage * blocksPerPage)
    const epocBlockList = paging.map(BlockHelper.getBlockDetail)
    const pages = _.ceil(allEpochs.length / blocksPerPage)
    const total = allEpochs.length
    await Promise.all(epocBlockList).then(items => res.json({ items, pages, currentPage, realTotal, total }))
}

const GET_EPOC_DETAIL = async (req, res, next) => {
    const number = req.params.slug
    const block = await BlockHelper.getBlockDetail(number)

    const m1m2 = await getM1M2List(block)
    const validators = bytesToAddress(Buffer.from(block.validators || '', 'hex'))
    const penalties = bytesToAddress(Buffer.from(block.penalties || '', 'hex'))
    const rewards = await getRewardList(block)

    const epocDetail = { m1m2, validators, penalties, rewards }
    res.json({ ...block._doc, epocDetail })
}

// Router
const EpochController = express.Router()

EpochController.get('/epochs', handler(GET_EPOCS, DEFAULT_ERROR))
EpochController.get('/epochs/:slug', handler(GET_EPOC_DETAIL, DEFAULT_ERROR))

export default EpochController