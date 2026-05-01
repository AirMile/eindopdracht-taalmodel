import express from 'express'
import { callSuspect, getHistoryForClient, getPublicCase, checkVerdict, resetUser } from './game.js'

const app = express()
app.use(express.json())
app.use(express.static('public'))

app.get('/api/case', (req, res) => {
    res.json(getPublicCase())
})

app.post('/api/gethistory', (req, res) => {
    const { userId } = req.body
    res.json(getHistoryForClient(userId))
})

app.post('/api/chat', async (req, res) => {
    const { userId, message } = req.body
    try {
        const result = await callSuspect(userId, message)
        res.json(result)
    } catch (err) {
        console.error('Chat error:', err.message)
        const isContentFilter = err.message?.includes('content management policy')
        res.status(500).json({
            error: true,
            message: isContentFilter
                ? 'Azure heeft deze vraag geblokkeerd door de content filter. Formuleer je vraag iets anders.'
                : `Serverfout: ${err.message}`
        })
    }
})

app.post('/api/accuse', (req, res) => {
    const { verdict } = req.body
    res.json(checkVerdict(verdict))
})

app.post('/api/reset', (req, res) => {
    const { userId } = req.body
    resetUser(userId)
    res.json({ ok: true })
})

const port = process.env.PORT || 3000
app.listen(port, () => console.log(`Server on http://localhost:${port}`))
