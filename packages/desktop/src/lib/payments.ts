// Payment message encoding — embedded in LocalMessage.content
// Format: PAYMENT_PREFIX + JSON.stringify(PaymentPayload)

export const PAYMENT_PREFIX = '\x00PAY\x00'

export type PaymentToken = 'ETH' | 'USDC'

export interface PaymentPayload {
  token: PaymentToken
  amount: string    // human-readable, e.g. "0.01"
  amountWei: string // base units as string (avoids BigInt serialization)
  txHash: string    // on-chain hash once submitted
  chainId: 8453
  note?: string
}

export function encodePaymentContent(p: PaymentPayload): string {
  return PAYMENT_PREFIX + JSON.stringify(p)
}

export function parsePaymentContent(content: string): PaymentPayload | null {
  if (!content.startsWith(PAYMENT_PREFIX)) return null
  try {
    return JSON.parse(content.slice(PAYMENT_PREFIX.length)) as PaymentPayload
  } catch {
    return null
  }
}

// Base mainnet USDC
export const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const

const ERC20_TRANSFER_ABI = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'recipient', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'nonpayable',
  },
] as const

function bytesToHexKey(bytes: Uint8Array): `0x${string}` {
  return ('0x' + Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')) as `0x${string}`
}

export async function sendEthPayment(
  privateKeyBytes: Uint8Array,
  toAddress: string,
  amountEther: string,
): Promise<string> {
  const { createWalletClient, http, parseEther } = await import('viem')
  const { privateKeyToAccount } = await import('viem/accounts')
  const { base } = await import('viem/chains')

  const account = privateKeyToAccount(bytesToHexKey(privateKeyBytes))
  const client = createWalletClient({ account, chain: base, transport: http() })

  const hash = await client.sendTransaction({
    to: toAddress as `0x${string}`,
    value: parseEther(amountEther),
  })
  return hash
}

export async function sendUsdcPayment(
  privateKeyBytes: Uint8Array,
  toAddress: string,
  amountHuman: string,
): Promise<string> {
  const { createWalletClient, http, parseUnits } = await import('viem')
  const { privateKeyToAccount } = await import('viem/accounts')
  const { base } = await import('viem/chains')

  const account = privateKeyToAccount(bytesToHexKey(privateKeyBytes))
  const client = createWalletClient({ account, chain: base, transport: http() })

  const hash = await client.writeContract({
    address: USDC_ADDRESS,
    abi: ERC20_TRANSFER_ABI,
    functionName: 'transfer',
    args: [toAddress as `0x${string}`, parseUnits(amountHuman, 6)],
  })
  return hash
}
