import { Contract } from 'web3-eth-contract/types'

import { getWeb3Instance, getAPI } from './web3'
import { Contracts } from 'components/Playground/types'

export const TOPICS_FOR_PROXYS = [
  {
    topic: '0xe74baeef5988edac1159d9177ca52f0f3d68f624a1996f77467eb3ebfb316537',
    indexed: 1
  },
  {
    topic: '0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b',
    dataIndex: 1
  }
]

export async function getContract(address: string): Promise<Contract | null> {
  const res = await fetch(`${getAPI()}?module=contract&action=getabi&address=${address}`)
  const abi = await res.json()
  const web3 = getWeb3Instance()

  if (abi.result === 'Contract source code not verified') {
    return null
  }

  return new web3.eth.Contract(
    JSON.parse(abi.result),
    address
  )
}

export async function findABIForProxy(
  proxyAddress: string
): Promise<string | undefined> {
  const web3 = getWeb3Instance()
  const api = `${getAPI()}?module=logs&action=getLogs&fromBlock=0&toBlock=latest&limit=1&address=${proxyAddress}&topic0=`

  let address
  for (let { topic, indexed, dataIndex } of TOPICS_FOR_PROXYS) {
    const res = await fetch(`${api}${topic}`)
    const data = await res.json()
    if (data.result.length > 0) {
      const event = data.result.pop()
      address = indexed
        ? getAddressByTopic(event, indexed!)
        : getAddressByData(event, dataIndex!)
      if (address) {
        return address
      }
    }
  }

  address = getAddressByStorageSlot(web3, proxyAddress)

  return address
}

function getAddressByTopic(event: { topics: string[] }, index: number) {
  return `0x${event.topics[index].slice(-40)}`
}

function getAddressByData(event: { data: string }, index: number) {
  const from = 32 * (index - 1) + 24
  return `0x${event.data.slice(2).substr(from, from + 40)}`
}

async function getAddressByStorageSlot(
  web3: any,
  proxyAddress: string
): Promise<string | undefined> {
  const res = await fetch(
    `${getAPI()}?module=proxy&action=eth_getStorageAt&address=${proxyAddress}&position=0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3&tag=latest`
  )
  const data = (await res.json()).result

  let address
  if (data && web3.utils.isAddress(data.slice(-40))) {
    address = `0x${data.slice(-40)}`
  }

  return address
}

export function sanitizeABI(abi: string) {
  return abi
    .trim()
    .replace(/(\r\n|\n|\r)/gm, '')
    .replace(/\s+/g, '')
    .replace(
      /(\w+:)|(\w+ :)/g,
      matchedStr => `"${matchedStr.substring(0, matchedStr.length - 1)}":`
    )
}

// Replace `methods: any` to `{ methodName: (params: types) Promise<any>}`
export function typeContractMethods(editorTypes: string, contracts: Contracts) {
  let methodTypes = 'contractMethods: any'

  if (contracts[0]) {
    const contract = contracts[0].instance
    if (contract) {
      methodTypes = `methods: {
    ${contract!.options.jsonInterface.map((method: any) => {
        let inputs = ''

        method.inputs.forEach((input: any, index: number) => {
          if (index > 0) {
            inputs += ', '
          }

          inputs += input.name
            ? input.name
            : method.inputs.length > 1
              ? `${input.type}_${index}`
              : input.type

          if (input.type.indexOf('int') !== -1) {
            inputs += ': number'
          } else {
            inputs += ': string'
          }

          if (input.type.indexOf('[]') !== -1) {
            inputs += `[]`
          }
        })

        return `${method.name}: (${inputs}) => any`
      })
          .join('\n')}
  }`
    }
  }

  return editorTypes.replace('contractMethods: any', methodTypes)
}