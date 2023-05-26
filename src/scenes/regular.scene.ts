import gsap from 'gsap'
import * as PIXI from 'pixi.js'
import { TGsapTimeline, TMixedObject, TNumberArray } from '../../framework/extends/short.types'

import { EGamelogicScene, TGamelogicSpin, TGamelogicRound, ESymbolCodes, TPayout } from '../extends/short.types'

import borderView from '../configs/borderview'
import BackgroundScene from './background.scene'
import { sleep, timeout } from '../../framework/functions/engine.funcs'
import { timelineCreate } from '../../framework/functions/timeline/create.funcs'
import { speedMode } from '../../framework/functions/speed/mode.func'
import MaskedScene from '../../framework/scenes/masked.scene'
import LogoComponent from '../components/logo.component'
import TentaclesComponent from '../components/tentacles.component'
import BlackoutComponent from '../../framework/components/blackout.component'
import SoundsService from '../../framework/services/sounds/sounds.service'
import ServiceModalComponent from '../modals/service.modal.component'
import ModalsComponent from '../../framework/components/modals.component'
import BuyBonusComponent from '../components/buybonus.button.component'
import AutoplayStopButtonComponent from '../components/autoplay.stop.button.component'
import PanelDesktopComponent from '../components/panel/panel.desktop.component'
import PanelMobileComponent from '../components/panel/panel.mobile.component'
import PlayMobileComponent from '../components/play/play.mobile.component'
import PlayDesktopComponent from '../components/play/play.desktop.component'
import MenuMobileComponent from '../components/menu/menu.mobile.component'
import MenuDesktopComponent from '../components/menu/menu.desktop.component'
import BigWinComponent from '../components/bigwin.component'
import AccumulationComponent from '../components/accumulation/accumulation.component'
import AccumulationKrakenComponent from '../components/accumulation.kraken/accumulation.kraken.component'
import FreespinsStartComponent from '../components/freespins.start.component'
import FreespinsEndComponent from '../components/freespins.end.component'
import SkipService from '../../framework/services/skip.service'

import { ICascadePlaygroundComponent } from '../components/cascade/playground.component'
import { ISymbolComponentCascade } from '../components/cascade/symbol.spine.component'
import { IFlySymbolsComponent } from '../components/fly.symbols.component'
import { TPoint } from '../../framework/extends/struct.types'
import CascadeComponent from '../components/cascade/cascade.component'
import game from '../classes/game.class'
import { randomValue } from '../../framework/functions/random/value.func'
import { randomExclude } from '../../framework/functions/random/exclude.func'

enum ESounds {
    barrelExplodes = 'barrelExplodes',
    thunderStrike = 'thunderStrike',
    seagull = 'seagull',
    waves = 'waves',
    coin = 'coin'
}

/**
 * Регулярная сцена
 */
export default class RegularScene extends MaskedScene {

    protected _sceneBackground: BackgroundScene
    protected _modalService: ServiceModalComponent

    public accumulation: AccumulationComponent
    public accumulationKraken: AccumulationKrakenComponent

    protected _logo: LogoComponent
    protected _tentacles: TentaclesComponent
    protected _bigWinComponent: BigWinComponent
    protected _blackoutComponent: BlackoutComponent

    protected _timelineWaitLines: TGsapTimeline

    protected _totalWin: number = 0

    protected _panel: PanelDesktopComponent & PanelMobileComponent
    protected _playPanel: PlayDesktopComponent & PlayMobileComponent
    protected _menu: MenuDesktopComponent & MenuMobileComponent
    protected _buyBonusComponent: BuyBonusComponent
    protected _autoplayStopButton: AutoplayStopButtonComponent

    protected _isBigWin: boolean = false

    public cascade: CascadeComponent
    protected _saveRandomWilds: TNumberArray = []

    protected _congratulationsAutoclose: number = 0

    protected _lastSound = {
        [ESounds.barrelExplodes]: '',
        [ESounds.thunderStrike]: '',
        [ESounds.seagull]: '',
        [ESounds.waves]: '',
        [ESounds.coin]: ''
    }

    public sounds: () => SoundsService
    public skip: () => SkipService

    /** @constructor */
    constructor() {

        super('regular.scene')

        this.bind('sounds')
        this.bind('skip')
    }

    /** @inheritdoc */
    async create(): Promise <boolean> {

        this._sceneBackground = this.producer.scene('background')
        this._modalService = this.producer.component<ModalsComponent>('modals').modal('service')

        this.cascade = new CascadeComponent()

        this._panel = this.producer.panel('panel')
        this._playPanel = this.producer.panel('play')
        this._menu = this.producer.panel('menu')

        this._autoplayStopButton = borderView.isMobile ? this.producer.panel('autoplay.stop.button') : null
        this._buyBonusComponent = this.get<boolean>('licenseBuyBonus', true) ? this.producer.panel('buybonus') : null
        this._bigWinComponent = this.producer.component('bigwin')
        this._blackoutComponent = this.producer.component('blackout')

        this.accumulation = new AccumulationComponent('accumulation.component')
        this.accumulationKraken = new AccumulationKrakenComponent('accumulation.kraken.component')

        this._tentacles = new TentaclesComponent('tentacles.component')
        this._logo = new LogoComponent('logo.component')

        this._sceneBackground.mode = EGamelogicScene.regular

        this._panel.switchPanel(EGamelogicScene.regular)

        borderView.isDesktop && this._menu.switchScene(EGamelogicScene.regular)

        await Promise.all([
            this.cascade.create(),
            this.accumulation.create(),
            this.accumulationKraken.create(),
            this._tentacles.create(),
            this._logo.create()
        ])

        this.instance.addChild(
            this.cascade.instance,
            this._tentacles.instance,
            this._logo.instance,
            this.accumulationKraken.instance,
            this.accumulation.instance
        )

        this.on('panel.component.coinvalue.component:change', this.name, () => {
            this._timelineWaitLines && this._timelineWaitLines.kill()
        })

        // optional
        this.on('panel.component.lines.component:change', this.name, () => {
            this._timelineWaitLines && this._timelineWaitLines.kill()
        })

        await this.adaptive(true)

        return true
    }

    /** @inheritdoc */
    async show(): Promise <void> {

        // this.sounds().loop('ambience', sounds.regular, 0.15)

        await Promise.all([
            this.instance.show(),
            this.producer.show('background', false),
            this.producer.panel('play').show(),
            this.producer.panel('panel').show(),
            this.producer.panel('menu').show(),
            this._buyBonusComponent?.show(),
            this._autoplayStopButton?.show(),
            this.accumulation.show(),
            this._tentacles.show(),
            this._logo.show()
        ])
    }

    /** @inheritdoc */
    async hide(): Promise <void> {

        this._playPanel && this._playPanel.hide()
    }

    /** @inheritdoc */
    async destroy(): Promise <boolean> {

        await Promise.all([
            this.cascade.destroy()
        ])

        this._timelineWaitLines && this._timelineWaitLines.clear().kill()

        this._buyBonusComponent?.hide()
        this._autoplayStopButton?.hide()
        this.accumulation.hide()
        this.accumulationKraken.hide()
        this._tentacles.hide()
        this._logo.hide()

        return true
    }

    /** @inheritdoc */
    async adaptive(_modeChanged?: boolean): Promise <void> {

        this.accumulation.draw()
        this.accumulationKraken.draw()

        switch (true) {

            case borderView.isMobileLandscape:

                this.cascade.scale.set(0.4)
                this.cascade.position.set(450, 180)

                this.accumulation.position.set(164, 96)
                this.accumulationKraken.position.set(660, 105)
                this._logo.position.set(86, 50)
                this._buyBonusComponent?.position.set(680, 275)
                this._autoplayStopButton?.position.set(765, 361)

                this.sceneMask(0, 0)
                break

            case borderView.isMobilePortrait:

                this.cascade.scale.set(0.5)
                this.cascade.position.set(207, 297)

                game.isFreespins
                    ? this.accumulation.position.set(115, borderView.gameHeight + borderView.gameInnerBottom / borderView.gameScale - 212)
                    : this.accumulation.position.set(80, borderView.gameHeight + borderView.gameInnerBottom / borderView.gameScale - 212)

                this.accumulationKraken.position.set(385, borderView.gameHeight + borderView.gameInnerBottom / borderView.gameScale - 186)
                this._logo.position.set(132, 5)
                this._buyBonusComponent?.position.set(190, borderView.gameHeight + borderView.gameInnerBottom / borderView.gameScale - 82)
                this._autoplayStopButton?.position.set(305, 10)

                this.sceneMask(0, 180)
                break

            default:

                this.cascade.scale.set(1)
                this.cascade.position.set(960, 445)

                this.accumulation.position.set(345, 70)
                this.accumulationKraken.position.set(125, 247)
                this._logo.position.set(borderView.gameWidth - 300, 290)
                this._buyBonusComponent?.position.set(1625, 675)

                this.sceneMask(335, 110)
                break
        }
    }

    /** */
    async processing(cascading: TGamelogicRound, isLast: boolean): Promise <TMixedObject> {

        const { playground: pg, kraken, win, frames, flySymbols } = this.cascade

        game.setCascading(cascading)

        if (cascading.bonusGame && ! game.isFreespins) {
            await this.toFreespins()
        }

        if (game.isFreespins) {
            this.updateTotalFreespins(-1)
            this.accumulation.resetFreespinsCircleMask()
        }

        while (game.nextPlayground()) {

            const isKraken = game.hasKraken() // Накопление для получения Кракена (накопилось или нет?)
            const reachedBiggestKraken = game.getFinishedMiniKrakens() === this.get('krakenScoreInterval', [4, 5, 6]).reduce((acc, score) => acc + score)

            pg.toggleMask()

            if (game.isInitialPlayground()) {
                await pg.animateMotionSpin(game.getInSymbols())
            } else {
                await pg.animateMotionRefill(game.getInSymbols())
            }

            pg.toggleMask(false)

            await this.changeRandomWilds(pg, flySymbols)

            if (game.hasPowderKegs()) {

                await sleep(speedMode(200, 0))
                await Promise.all([
                    this.animateFlyKegs(game.getPowderKegs(), pg, flySymbols),
                    this.accumulation.explosionArrow()
                ])
            }

            if (game.hasKrakenHit()) {

                const krakenHit = game.getKrakenHit()

                await this._tentacles.animateHitTentacle({
                    krakenHit,
                    scene: this._sceneBackground.instance.children[0],
                    playground: pg,
                    kraken,
                    reachedBiggestKraken: game.stopGetSlimes,
                    spineBackground: this._sceneBackground.backgroundAnimation.instance.children[0]
                })
            }

            if (isKraken) {
                const krakenWilds = game.getKraken()
                const krakenCenter = this._getCenterKraken(pg, krakenWilds)

                await Promise.all([
                    kraken.animateKrakenStart(krakenCenter, krakenWilds.length),
                    this.symbolsUnderKraken(krakenWilds, pg, true)
                ])
            }

            const winnersIndexes = game.getWinnerIndexes()
            const winnersIndexesWithoutKeg = game.getWinnerIndexes(true)

            if (game.hasPayouts()) {

                ! this.get<boolean>('fastPlayEnabled', false) && await sleep(100)

                // show payouts

                let showPayouts = true
                this.once('settings.skipEnabled:set', this.name, ({ value }: { value: boolean }) => showPayouts = ! value)

                let idx = 0
                const kegClusters = []
                let noRepeatKegWin = []
                const linkRandomWilds = game.getRandomWildsWithLink()
                for (const payout of game.getPayouts()) {
                    if (showPayouts) {

                        kegClusters.map(keg => payout.indexes.includes(keg) && ! noRepeatKegWin.includes(keg) && noRepeatKegWin.push(keg))

                        await Promise.all([
                            pg.animateWinTwo(payout.indexes, noRepeatKegWin, kraken, game.getSlimeHP(), game.stopGetSlimes),
                            win.animatePayout(payout),
                            this._playSymbolSound(payout.symbol),
                            isKraken && kraken.animateKrakenWin(idx === 0)
                        ])

                        game.isFreespins
                            ? await sleep(speedMode(400, 200))
                            : await sleep(speedMode(200, 100))

                        linkRandomWilds.map(arr => payout.indexes.includes(arr[0]) && ! kegClusters.includes(arr[0]) && kegClusters.push(arr[0]))
                        noRepeatKegWin = []
                        idx ++
                    }

                    await this.updateWin(payout)
                }

                // symbols out
                pg.animateInactive(winnersIndexes)

                this.instance.setChildIndex(this.cascade.instance, 4) // Подобие z-index

                const isHittedSlime = (game.isFreespins && ! game.stopGetSlimes)
                    ? await kraken.animateSlimeCounterOff(winnersIndexes, game.getSlimeHP(), game.getSlimeHPDead())
                    : false

                this._lastSound[ESounds.waves] = randomExclude(['waves_1', 'waves_2', 'waves_3'], this._lastSound[ESounds.waves])
                this.emit('sounds:play', { name: this._lastSound[ESounds.waves] })

                frames.animateFrames(winnersIndexesWithoutKeg)

                if (isKraken) {
                    this.symbolsUnderKraken(game.getKraken(), pg)
                    kraken.animateKrakenHide()

                    await this.accumulationKraken.changeKrakenAccumulation(false, game.getFinishedMiniKrakens())
                }

                // исключаем анимацию компаса на последнем плейграунде и спине
                ! (game.isLastPlayground() && isLast) && this.startAnimateAccumulation(game.getTotalScore(), game.isFirstPlayground())

                if (showPayouts) {
                    isHittedSlime
                        ? await sleep(speedMode(1100, 800)) // Задержка из-за уменьшения HP у Slime
                        : await sleep(speedMode(900, 650))
                }

                if (game.isFreespins) {
                    await sleep(speedMode(200, 0))
                    this.accumulationKraken.activateKrakenItems(game.getFinishedMiniKrakens())
                }

                pg.animateOut(winnersIndexesWithoutKeg)

                setTimeout(() => this.instance.setChildIndex(this.cascade.instance, 0), 500)

                this.animateFlyWildsIn(pg, flySymbols)

                this._logo.animateWin()

            }

            if (reachedBiggestKraken) {
                kraken.slimeDieAll()
                game.stopGetSlimes = true
            }

            // respawn and move
            game.hasPayouts() && await sleep(400)

            pg.respawn(winnersIndexes)

            await Promise.all([
                pg.animateMotionMove(),
                pg.animateInactive()
            ])

        }

        game.hasPayouts() && await sleep(speedMode(400, 200))

        if (! game.isFreespins && isLast && this._bigWinComponent.isBigWin(game.totalCoins)) {
            const prevAmbience = this.sounds().ambience
            this.sounds().ambience = this.sounds().ambience * 0.5

            await Promise.all([
                this._bigWinComponent.animate(game.totalCoins),
                this._blackoutComponent.turnOn(0x180325, 0.9)
            ])

            this.sounds().ambience = prevAmbience

            await this._blackoutComponent.turnOff()
        }

        if (game.winFreespins()) {
            await sleep(200)

            this.accumulation.switchToFreespins()
            await sleep(speedMode(1000, 850))
            await this.freespinsStart(game.winFreespinsCount())

        } else if (isLast) {

            if (game.isFreespins) {

                await sleep(200).then(() => {
                    //! isBigWin && this._playCongratSound(game.totalCoins)
                    return this.freespinsEnd()
                })
                kraken.slimeDieAll()

                this._switchTotalPanel(EGamelogicScene.regular)
            }
        }

        return {}
    }

    /**
     * Переключение панелей
     * @param scene - будущая сцена
     */
    protected async _switchTotalPanel(scene = null): Promise <void> {

        const show = scene === EGamelogicScene.regular

        if (borderView.isMobile) {
            show ? this._panel.inputs.balance.show() : this._panel.inputs.balance.hide()
            show ? this._panel.inputs.cashbet.show() : this._panel.inputs.cashbet.hide()
            show ? this._panel.inputs.win.show() : this._panel.inputs.win.hide()
        }

        show ? this._buyBonusComponent.show() : this._buyBonusComponent.hide()

        this._panel.switchPanel(scene)
        await this._playPanel.switchPanel(scene)
    }

    /**
     * Переключение видимости play-панели и buybonus
     * @param show - показать play-панель и buybonus?
     */
    togglePlayPanelVisibility(show: boolean): void {

        if (borderView.isMobile && this._playPanel) {
            show ? this._playPanel.play.show() : this._playPanel.play.hide()
            show ? this._playPanel.coinvalue.show() : this._playPanel.coinvalue.hide()
            show ? this._playPanel.auto.show() : this._playPanel.auto.hide()
            show ? (this._playPanel.background.alpha = 1) : (this._playPanel.background.alpha = 0)
            show ? this._buyBonusComponent?.show() : this._buyBonusComponent?.hide()
        }
    }

    /** Переход во Freespins (для buyBonus) */
    async toFreespins(): Promise <void> {

        await sleep(200)
        this.accumulation.forceToFreespins()

        await this.freespinsStart(game.winFreespinsCount() + 1) // +1 из-за regular
    }

    /** 
     * Запуск анимации накопления
     * @param totalScore - полный score, с учётом предыдущих
     * @param newSpin
     */
    async startAnimateAccumulation(totalScore: number, newSpin = false): Promise <void> {

        const accumulationData = {
            totalScore,
            charge: game.getCharge(),
            newSpin
        }

        this.accumulation.animateAccumulation(accumulationData)
    }

    /** */
    async animateFlyKegs(indexes: TNumberArray, pg: ICascadePlaygroundComponent, flySymbols: IFlySymbolsComponent): Promise <void> {

        for (let i = 0; i < indexes.length; i ++) {

            const symbol = pg.getSymbol(indexes[i])

            // Бочка всегда поверх других анимаций
            symbol.instance.zIndex = indexes[i] + 1

            flySymbols.animateKeg({
                assets: {
                    name: 'spineBarrelSymbol',
                    animationName: 'fall'
                },
                position: {
                    from: new PIXI.Point(-500, 50),
                    to: new PIXI.Point(symbol.position.x, symbol.position.y)
                },
                scale: pg.getSpineSymbolScale(9),
                duration: speedMode(0.4, 0.25),
                index: i,
                symbol,
                symbolTo: ESymbolCodes.barrel
            })
        }

        await sleep(speedMode(1000, 400))

        // Вернём начальные значения zIndex
        game.getPowderKegs().forEach(index => pg.getSymbol(index).instance.zIndex = 0)
    }

    /**
     * Анимация разлетающихся сундуков от взрыва бочки
     * @param indexes - массив позиций вида [бочка, сундук, сундук, ...]
     * @param pg - Playground-компонент
     * @param flySymbols - FlySymbols-компонент
     * @param isSounds - воспроизводить звук?
     */
    async animateFlyingWilds(indexes: TNumberArray, pg: ICascadePlaygroundComponent, flySymbols: IFlySymbolsComponent, isSounds: boolean): Promise<void> {

        const symbolKeg = pg.getSymbol(indexes[0])
        const scale = pg.symbolScale

        const symbols: Array <ISymbolComponentCascade> = []
        const symbolsPosition: Array <TPoint> = [] // Координаты летящих сундуков

        indexes.forEach((index, idx) => {
            if (idx === 0) return
            const currentSymbol = pg.getSymbol(index)

            this._saveRandomWilds.push(index)
            symbols.push(currentSymbol)
            symbolsPosition.push({ x: currentSymbol.position.x, y: currentSymbol.position.y })
        })

        const animateTwoTimeDelay = 0
        const flyTimeDelay = speedMode(250, 150) / 1000

        this._timeline = timelineCreate()
            .call(() => {
                // Создание отдельной анимации поверх playground, иначе обрезается маской
                flySymbols.animateExplodeKeg({
                    assets: {
                        name: 'spineBarrelSymbol',
                        animationName: 'bang'
                    },
                    scale,
                    position: {
                        from: new PIXI.Point(symbolKeg.position.x, symbolKeg.position.y)
                    },
                    symbol: symbolKeg
                })

                if (isSounds) {
                    this._lastSound[ESounds.barrelExplodes] = randomExclude(['barrel_explodes_1', 'barrel_explodes_2', 'barrel_explodes_3'], this._lastSound[ESounds.barrelExplodes])
                    this.emit('sounds:play', { name: this._lastSound[ESounds.barrelExplodes] })
                }
            }, null, animateTwoTimeDelay)
            .call(() => {
                indexes.slice(1).forEach((symbolIdx, idx) => {
                    flySymbols.animateWildIn({
                        assets: {
                            name: 'staticSymbols',
                            textureName: 'MP_wild_chest.png'
                        },
                        position: {
                            from: new PIXI.Point(symbolKeg.position.x, symbolKeg.position.y),
                            to: new PIXI.Point(symbolsPosition[idx].x, symbolsPosition[idx].y)
                        },
                        scale,
                        duration: speedMode(0.8, 1),
                        symbol: symbols[idx],
                        symbolTo: ESymbolCodes.wild
                    }, () => pg.getSymbol(symbolIdx))
                })
            }, null, flyTimeDelay)
    }

    /**
     * Анимация разлетающихся сундуков (и взрывы бочек, если krakenRage)
     * @param pg - Playground-компонент
     * @param flySymbols - FlySymbols-компонент
     */
    async animateFlyWildsIn(pg: ICascadePlaygroundComponent, flySymbols: IFlySymbolsComponent): Promise <void> {

        if (game.hasRandomWilds()) {
            let idx = 0
            for (const wilds of game.getRandomWildsWithLink()) {

                this.animateFlyingWilds(wilds, pg, flySymbols, idx === 0)
                idx ++
            }
        }
    }

    /** */
    async changeRandomWilds(pg: ICascadePlaygroundComponent, flySymbols: IFlySymbolsComponent): Promise<void> {

        this._saveRandomWilds.map(index => {
            const symbol = pg.getSymbol(index)

            symbol.code = ESymbolCodes.wild
            gsap.killTweensOf(symbol.scale)
            symbol.scale.set(1)
        })

        this._saveRandomWilds = []
        flySymbols.destroyRandomWilds()

    }

    /** Прячем/показываем символы под Кракен Wild
     * @param indexes - позиции символов, которые нужно уменьшить/увеличить
     * @param pg - компонент Playground
     * @param hide - уменьшать символы?
     */
    async symbolsUnderKraken(indexes: TNumberArray, pg: ICascadePlaygroundComponent, hide = false): Promise <void> {

        hide && await sleep(speedMode(1500, 1200))

        const alpha = hide ? 0.5 : 1
        const positions = hide ? { x: 0.3, y: 0.3 } : { x: 1, y: 1 }

        const timeline = timelineCreate()

        for (let i = 0; i < indexes.length; i ++) {

            const symbol = pg.getSymbol(indexes[i])

            timeline
                .to(symbol, { alpha, duration: 0.25 }, 0)
                .to(symbol.scale, { x: positions.x, y: positions.y, duration: 0.25 }, '<')
        }

        timeline.timeScale(speedMode(1, 1.4))
        timeline.totalDuration() && await timeline.then()
        timeline.kill()
    }

    /** Обновление видимости элементов и Total Panel
     * @param payout - объект с данными по выигрышу
     */
    async updateWin(payout: TPayout): Promise <void> {

        const { coefficient: coins } = payout

        if (! game.hasMaxWin) {

            const hasMaxWin = game.addCoins(coins)

            if (hasMaxWin) {
                await this._modalService.typeMaxWin(this.get('limitBets', 0)).open()
            }

            // Обновение Total Win
            if (game.isFreespins) {
                const scene = game.isFreespins ? EGamelogicScene.freespins : EGamelogicScene.regular
                this._updateTotalPanel(scene, game.totalCoins, game.totalFreespins)
            } else {
                borderView.isMobile && this._panel.setWin(game.totalCoins * this.getCurrentCoinValue())
            }
        }
    }

    /** Обновление количества Freespins
     * @param freespins - количество freespins
     */
    updateTotalFreespins(freespins: number): void {

        const scene = game.isFreespins ? EGamelogicScene.freespins : EGamelogicScene.regular

        game.totalFreespins += freespins
        this._updateTotalPanel(scene, game.totalCoins, game.totalFreespins)
    }

    /**
     * Управляет показом и data для Total Panel (Freespins)
     * @param scene
     * @param totalCoins - текущий выигрыш
     * @param totalFreespins - количество оставшихся freespins
     */
    protected _updateTotalPanel(scene: EGamelogicScene, totalCoins: number, totalFreespins: number): void {

        // Обновление total-панели
        this._switchTotalPanel(scene)

        // Обновление информации
        borderView.isDesktop
            ? this._playPanel.updateFreespinsTotalData(totalCoins * this.getCurrentCoinValue(), totalFreespins)
            : this._panel.updateFreespinsTotalData(totalCoins * this.getCurrentCoinValue(), totalFreespins)

    }

    /** */
    async freespinsStart(count: number): Promise <void> {
        this._congratulationsAutoclose = this.get('processingAutoplay', false) && ! this.get <boolean>('autoplayStopOnBonus', false) ? 2000 : 0
        game.isFreespins = true

        await this.emit('bonus:begin')

        await Promise.all([
            this.producer.component <FreespinsStartComponent>('freespins.start').showModal(
                count,
                this._blackoutComponent,
                this._congratulationsAutoclose
            ).then(() => this.emit('sounds:play', { name: 'spin_start' })),
            sleep(200).then(() => this.playMusic()),
            sleep(400).then(() => this._sceneBackground.toFreespins()),

            await sleep(300),
            this.togglePlayPanelVisibility(false),
            this.accumulationKraken.show(),
            this.adaptive()
        ])

        this.updateTotalFreespins(count)

    }

    /** */
    async freespinsEnd(): Promise <void> {

        game.isFreespins = false

        const prevAmbience = this.sounds().ambience
        this.sounds().ambience = this.sounds().ambience * 0.5

        await Promise.all([
            this.producer.component <FreespinsEndComponent>('freespins.end').showModal(
                game.totalCoins * this.getCurrentCoinValue(),
                game.totalCoins,
                this._blackoutComponent,
                this._congratulationsAutoclose
            ),
            await sleep(300),
            this.accumulationKraken.changeKrakenAccumulation(true),
            this.togglePlayPanelVisibility(true),
            this.accumulationKraken.hide(),
            this.adaptive()
        ])

        this.sounds().ambience = prevAmbience

        this.playMusic()
        this._sceneBackground.toRegular()

        await this.emit('bonus:end')
    }

    /** Обработка обычного спина */
    async processingRegular(spin: TGamelogicSpin): Promise <void> {

        this._totalWin += spin.coins * this.currency().coinValue

        ! this._isBigWin && await this.highlight(spin)

        await this.checkFreespins(spin)
    }

    /** Обработка выигрышного поля, подсветка */
    async highlight(spin: TGamelogicSpin): Promise <void> {

        if (! spin.clusterCoords.length) {

            // // Звук проигрыша за неоправдавшуюся интригу

            return
        }

        // Обязываем пользователя смотреть на подсветку только 200 ms, далее можно пропустить
        ! this.get<boolean>('fastPlayEnabled', false) && await sleep(200)
    }

    /** Обработка триггера фриспинов */
    async checkFreespins(_spin: TGamelogicSpin): Promise <void> {

    }

    /** */
    async waitMinSpinTime(action: number, roll: number): Promise <void> {

        const ms = this.get('licenseMinSpinTime', 0) * 1000 - action

        await Promise.all([
            ms > 0 ? sleep(ms) : null,
            roll > 0 ? sleep(roll) : null
        ])
    }

    /** Начало вращения барабанов */
    async startSpin(): Promise <void> {

        this._totalWin = 0

        await this.waitMinSpinTime(1050, 0)

    }

    /** Остановка при ошибке */
    async failSpin(): Promise <void> {

        const { playground } = this.cascade

        playground.toggleMask()
        await playground.animateMotionSpin(playground.getLosingCombination())
        playground.toggleMask(false)
    }

    /** */
    playMusic() : void {

        const mode = game.isFreespins ? 'bonus' : 'regular'

        this._loopAmbienceSea()

        this.emit('sounds:loop', { track: 'mainTheme', name: `main_theme_${mode}`, crossfade: 5 })
        this.emit('sounds:loop', { track: 'ocean', name: `background_ocean_${mode}`, crossfade: 5 })
    }

    /**
     * рандомный луп чаек и грома на фоне регулярки
     */
    _loopAmbienceSea(prevName: string = null): void {

        let delay: number
        let name: string
        let isCreatedOnFreespins: boolean

        if (game.isFreespins) {
            this._lastSound[ESounds.thunderStrike] = randomExclude(['thunder_strike_1', 'thunder_strike_2', 'thunder_strike_3', 'thunder_strike_4'], this._lastSound[ESounds.thunderStrike])
            name = this._lastSound[ESounds.thunderStrike]
            delay = randomValue([30000, 40000])
            isCreatedOnFreespins = true
        } else {
            this._lastSound[ESounds.seagull] = randomExclude(['seagull_1', 'seagull_2', 'seagull_3'], this._lastSound[ESounds.seagull])
            name = this._lastSound[ESounds.seagull]
            delay = randomValue([30000, 40000])
            isCreatedOnFreespins = false
        }

        // исключить повтор подряд одноименного трека
        if (name === prevName) return this._loopAmbienceSea(name)

        timeout(() => {
            // исключить, если переменные с другой сцены
            if (isCreatedOnFreespins !== game.isFreespins) return

            this.emit('sounds:play', { name })
            this._loopAmbienceSea(name)
        }, delay)
    }

    /** Озвучка выигрышных символов на сцене*/
    protected _playSymbolSound(symbol: number): void {
        let name: string = ''
        let delay = 0
        let tag = ''
        switch (symbol) {
            case ESymbolCodes.pirate: name = 'pirate_green'; delay = speedMode(550, 400); tag = 'pirate_green'; break
            case ESymbolCodes.captain: name = 'pirate_captain'; delay = speedMode(860, 650); tag = 'pirate_captain'; break
            case ESymbolCodes.girl: name = 'pirate_girl'; delay = speedMode(450, 350); tag = 'pirate_girl'; break
            case ESymbolCodes.sailor: name = 'pirate_black'; delay = speedMode(200, 70); tag = 'pirate_black'; break
            default: {
                this._lastSound[ESounds.coin] = randomExclude(['coin_1', 'coin_2', 'coin_3'], this._lastSound[ESounds.coin])
                name = this._lastSound[ESounds.coin]; delay = speedMode(210, 50); tag = `${this._lastSound[ESounds.coin]}`; break
            }
        }
        this.emit('sounds:play', { name, delay, tag })
    }

    /**
     * Получить центр Кракена
     * @param playground
     * @param krakenWilds - номера символов для замены на Kraken
     */
    protected _getCenterKraken(playground: ICascadePlaygroundComponent, krakenWilds: TNumberArray): TNumberArray {

        const posX = []
        const posY = []

        krakenWilds.forEach(el => {
            const position = playground.getSymbolPositions(el)
            posX.push(position[0])
            posY.push(position[1])
        })

        const centerX = Math.floor((Math.max(...posX) + Math.min(...posX)) / 2)
        const centerY = Math.floor((Math.max(...posY) + Math.min(...posY)) / 2)

        return [centerX, centerY]
    }

    /** Получить текущий coinValue */
    public getCurrentCoinValue(): number {

        return parseFloat(this.get('coinValues', [])[this.get('coinLevel', 0)])
    }

}
