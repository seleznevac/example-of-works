import * as PIXI from 'pixi.js'
import borderView from '../configs/borderview'
import { ESymbolCodes } from '../extends/short.types'
import Assets from '../../framework/classes/assets.class'
import Loaders from '../../framework/classes/loaders.class'
import skipable from '../../framework-cascade/classes/skipable.class'
import { speedMode } from '../../framework/functions/speed/mode.func'
import { ICascadePlaygroundComponent } from './cascade/playground.component'
import AbstractComponent from '../../framework/components/abstract.component'
import SpineAssets, { Spine } from '../../framework/classes/spine.assets.class'
import { timelineCreate } from '../../framework/functions/timeline/create.funcs'
import { TGsapTimeline, TNumberArray, TPixiTextures, TStringArray } from '../../framework/extends/short.types'
import { randomExclude } from '../../framework/functions/random/exclude.func'
import { ISymbolComponentCascade } from './cascade/symbol.spine.component'
import { IKrakenComponent } from './kraken.component'

type TTentaclesData = {
    krakenHit: {[key: number]: number},
    scene: PIXI.DisplayObject,
    playground: ICascadePlaygroundComponent
    kraken: IKrakenComponent,
    reachedBiggestKraken: boolean,
    spineBackground: PIXI.DisplayObject
}

enum ELogoAnimations {
    idle = 'idle',
    punch = 'punch_'
}

enum ESounds {
    krakenTentacles = 'krakenTentacles',
    krakenScream = 'krakenScream',
    krakenStrike = 'krakenStrike'
}

const animations = {
    splash: 'splash'
}

const assetsSplash = 'splash'

const desktopConfig = {
    position: [959, 550],
    scale: 1,
    cascadeScale: 1,
    splashCenterPosition: [810, 250] // Всплеск воды по центру доски (для подсчёта)
}

const mobileLandscapeConfig = {
    position: [441, 210],
    scale: 0.39,
    cascadeScale: 0.4,
    splashCenterPosition: [380, 75]
}

const mobilePortraitConfig = {
    position: [210, 355],
    scale: 0.48,
    cascadeScale: 0.5,
    splashCenterPosition: [130, 198]
}

/** Компонент щупалец */
export default class TentaclesComponent extends AbstractComponent {

    protected _animationTentacles: Spine // Анимация щупалец
    protected _underShipTentaclesContainer: PIXI.Container // Контейнер с щупальцами, которые бьют из-под корабля
    protected _tentaclesUsuallContainer: PIXI.Container // Контейнер с обычнымии щупальцами
    protected _timeline: TGsapTimeline

    protected _animationPositions = [ // Массив с позициями на поле (для указания нужной анимации в ELogoAnimations)
        [5, 12], [7, 14], [9, 16, 23], [10, 17, 24, 31], [11, 18, 25], [12, 19, 26], [13, 20, 27], [19, 26, 33, 40], [21, 28, 35], [32, 39], [34, 41]
    ]

    protected _underShipTentaclesPositions = [5, 11, 12, 13, 18, 19, 20, 25, 26, 27]

    protected _lastSound = {
        [ESounds.krakenTentacles]: '',
        [ESounds.krakenScream]: '',
        [ESounds.krakenStrike]: ''
    }

    /** @constructor */
    constructor(name: string = 'tentacles.component') {
        super(name)

        this.hide()
    }

    /** @destroy */
    async destroy(): Promise <this> {

        await Promise.all([
            this._animationTentacles.destroy(),
            this._underShipTentaclesContainer.destroy(),
            this._tentaclesUsuallContainer.destroy(),
            this._timeline.destroy()
        ])

        this._timeline = null

        return this
    }

    /** */
    async draw(): Promise <this> {

        return this
    }

    /** 
     * Анимация ударов щупальцами
     * @param tentaclesData.krakenHit - массив с позициями ударов щупальцами
     * @param tentaclesData.scene - фон
     * @param tentaclesData.playground
     */
    async animateHitTentacle(tentaclesData: TTentaclesData): Promise <void> {

        const { krakenHit, scene, playground, kraken, reachedBiggestKraken, spineBackground } = tentaclesData

        const config = borderView.isDesktop ? desktopConfig : borderView.isLandscape ? mobileLandscapeConfig : mobilePortraitConfig

        const symbols: Array <ISymbolComponentCascade> = []
        for (const position in krakenHit) {
            symbols.push(playground.getSymbol(parseFloat(position)))
        }

        this._underShipTentaclesContainer = new PIXI.Container()
        this._tentaclesUsuallContainer = new PIXI.Container()

        // idle-анимация щупалец
        this._animationTentacles = SpineAssets.getSpineAnimation('spineTentacles')
        this._animationTentacles.position.set(...config.position)
        this._animationTentacles.scale.set(config.scale)
        this._animationTentacles.hide()
        this.instance.addChild(this._underShipTentaclesContainer, this._tentaclesUsuallContainer, this._animationTentacles) // idle-анимация всегда поверх

        const hitPositionNames: TStringArray = [] // Названия анимаций ударов щупальцами
        const underShipTentacle: boolean[] = [] // Удар щупальцем из-под корабля?
        const hitTentacleClones: Spine[] = [] // Анимации ударов щупальцами
        const splashWater: PIXI.AnimatedSprite[] = [] // Анимации всплеска воды ([Sprite, null, Sprite, ...]) 

        // Получим названия анимаций, Spine для каждого удара и AnimatedSprite для всплесков
        let idx = 0
        for (const position in krakenHit) {

            const hitFieldPosition = parseFloat(position)
            // Название анимации
            hitPositionNames.push(this._getAnimationName(hitFieldPosition + 1)) // "+ 1" из-за того, что начало не с "0", а с "1"

            // Удар щупальцем из-под корабля?
            underShipTentacle.push(this._underShipTentaclesPositions.includes(hitFieldPosition + 1))

            // Анимация удара
            const hitTentacle = this._animationTentacles.clone('hitTentacle') // Клон для одновременного запуска 2-х анимаций
            hitTentacle.position.set(...config.position)
            hitTentacle.hide()
            borderView.isMobile && hitTentacle.scale.set(config.scale)
            hitTentacleClones.push(hitTentacle)

            // Анимация всплеска, если нужно
            if (symbols[idx].code === ESymbolCodes.barrel) { // Если ударили по бочке, то всплеск не нужен
                splashWater.push(null)
            } else {
                const splash = new PIXI.AnimatedSprite(this._getTextures(assetsSplash, animations.splash))
                splash.pivot.set(0.5)
                borderView.isMobile && splash.scale.set(0.5)
                splash.position.set(...this._addPositions(config.splashCenterPosition, playground.getSymbolPositions(hitFieldPosition)))
                splash.alpha = 0
                splash.animationSpeed = 1

                splashWater.push(splash)
                this.instance.addChild(splash)
            }
            idx ++
        }

        // Запуск фоновой анимации (idle-щупальцы)
        this._timeline = timelineCreate()
            .addLabel('start', 0)
            .call(() => {
                this._animationTentacles.show()
                this._animationTentacles.animate(ELogoAnimations.idle, false, false, speedMode(1, 1.4))
            }, null, 'start')

        const hitOrder = {} // Объект вида { позиция удара: время задержки }

        // Запуск анимации ударов
        hitTentacleClones.forEach((tentacleClone, idx, tentacleClonesList) => {
            const timeDelay = idx * 0.5

            hitOrder[krakenHit[idx]] = timeDelay + speedMode(1200, 900) / 1000

            underShipTentacle[idx]
                ? this._underShipTentaclesContainer.addChild(tentacleClone)
                : this._tentaclesUsuallContainer.addChild(tentacleClone)

            this._timeline
                .addLabel('hitStart', `start+=${timeDelay}`)
                .call(() => {
                    tentacleClone.show()
                    tentacleClone.animate(hitPositionNames[idx], false, false, speedMode(1, 1.4))

                    if (idx === 0) {
                        this._lastSound[ESounds.krakenTentacles] = randomExclude(['kraken_tentacles_1', 'kraken_tentacles_2', 'kraken_tentacles_3', 'kraken_tentacles_4'], this._lastSound[ESounds.krakenTentacles])
                        this.emit('sounds:play', { name: this._lastSound[ESounds.krakenTentacles], tag: idx.toString(), delay: 90 })
                    }

                    this._lastSound[ESounds.krakenScream] = randomExclude(['kraken_scream_1', 'kraken_scream_2', 'kraken_scream_3'], this._lastSound[ESounds.krakenScream])
                    this.emit('sounds:play', { name: this._lastSound[ESounds.krakenScream], tag: idx.toString() })
                }, null, 'hitStart')
                .call(() => {
                    if (idx + 1 === tentacleClonesList.length) {
                        this._lastSound[ESounds.krakenTentacles] = randomExclude(['kraken_tentacles_1', 'kraken_tentacles_2', 'kraken_tentacles_3', 'kraken_tentacles_4'], this._lastSound[ESounds.krakenTentacles])
                        this.emit('sounds:play', { name: this._lastSound[ESounds.krakenTentacles], tag: idx.toString(), delay: 0 })
                    }
                }, null, 'hitStart+=1.6')

            // Анимация всплеска 
            if (splashWater[idx]) {
                this._timeline
                    .call(() => {
                        splashWater[idx].alpha = 1
                        splashWater[idx].play()

                        this._lastSound[ESounds.krakenStrike] = randomExclude(['kraken_strike_1', 'kraken_strike_2', 'kraken_strike_3', 'kraken_strike_4'], this._lastSound[ESounds.krakenStrike])
                        this.emit('sounds:play', { name: this._lastSound[ESounds.krakenStrike], tag: idx.toString(), delay: 70 })
                    }, null, 'hitStart+=1.2')
                    .call(() => {
                        ! reachedBiggestKraken && kraken.animateSlimeStart(symbols[idx], symbols[idx].index, krakenHit[symbols[idx].index])
                        symbols[idx].code = ESymbolCodes.krakenKid
                    }, null, 'hitStart+=1.4')
                    .call(() => {
                        splashWater[idx].stop()
                        splashWater[idx].destroy()
                    }, null, 'hitStart+=1.6')
            } else { // Анимация взрыва
                this._timeline
                    .call(() => {
                        symbols[idx].code = ESymbolCodes.wild
                    }, null, 'hitStart+=2.1')
            }

            // Движение сцены, символов и щупалец от удара
            const scenePosX = scene.position.x
            const scenePosY = scene.position.y
            const spineBackgroundPosX = spineBackground.position.x
            const spineBackgroundPosY = spineBackground.position.y
            const slimesPosX = kraken.position.x
            const slimesPosY = kraken.position.y
            const tentaclesPosX = this._underShipTentaclesContainer.position.x
            const tentaclesPosY = this._underShipTentaclesContainer.position.y
            const pgPosX = playground.position.x
            const pgPosY = playground.position.y

            this._timeline.addLabel('moveSceneStart', `start+=${timeDelay + 1.2}`)

            this._timeline
                // Фон
                .to(scene, { rotation: Math.PI / 100, x: scenePosX - 5, y: scenePosY - 5, duration: 0.05, ease: 'expo.out' }, 'moveSceneStart')
                .to(scene.scale, { x: 1.05, y: 1.05 }, '<')
                .to(scene, { rotation: -(Math.PI / 150), duration: 0.2, ease: 'power1.inOut' }, 'moveSceneStart+=0.05')
                .to(scene, { rotation: 0, x: scenePosX, y: scenePosY, duration: 0.2, ease: 'power1.inOut' }, 'moveSceneStart+=0.25')
                .to(scene.scale, { x: 1, y: 1 }, '<')

                // Динамичные элементы фона (флаг, ядро ...)
                .to(spineBackground, { rotation: Math.PI / 100, x: spineBackgroundPosX - 5, y: spineBackgroundPosY - 5, duration: 0.05, ease: 'expo.out' }, 'moveSceneStart')
                .to(spineBackground.scale, { x: 1.05, y: 1.05 }, '<')
                .to(spineBackground, { rotation: -(Math.PI / 150), duration: 0.2, ease: 'power1.inOut' }, 'moveSceneStart+=0.05')
                .to(spineBackground, { rotation: 0, x: spineBackgroundPosX, y: spineBackgroundPosY, duration: 0.2, ease: 'power1.inOut' }, 'moveSceneStart+=0.25')
                .to(spineBackground.scale, { x: 1, y: 1 }, '<')

                // Slime (рамки с щупальцами)
                .to(kraken, { rotation: Math.PI / 100, x: slimesPosX - 5, y: slimesPosY - 5, duration: 0.05, ease: 'expo.out' }, 'moveSceneStart')
                .to(kraken.scale, { x: 1.05, y: 1.05 }, '<')
                .to(kraken, { rotation: -(Math.PI / 150), duration: 0.2, ease: 'power1.inOut' }, 'moveSceneStart+=0.05')
                .to(kraken, { rotation: 0, x: slimesPosX, y: slimesPosY, duration: 0.2, ease: 'power1.inOut' }, 'moveSceneStart+=0.25')
                .to(kraken.scale, { x: 1, y: 1 }, '<')

                // Щупальца из-под корабля
                .to(this._underShipTentaclesContainer, { rotation: Math.PI / 100, x: tentaclesPosX - 4, y: tentaclesPosY - 4, duration: 0.05, ease: 'expo.out' }, 'moveSceneStart')
                .to(this._underShipTentaclesContainer, { rotation: 0, y: tentaclesPosY, duration: 0.3, ease: 'power1.inOut' }, 'moveSceneStart+=0.25')

                // Игровое поле
                .to(playground, { rotation: Math.PI / 100, x: pgPosX - 5, y: pgPosY - 5, duration: 0.05, ease: 'expo.out' }, 'moveSceneStart')
                .to(playground.scale, { x: 1.05, y: 1.05 }, '<')
                .to(playground, { rotation: -(Math.PI / 150), duration: 0.2, ease: 'power1.inOut' }, 'moveSceneStart+=0.05')
                .to(playground, { rotation: 0, x: pgPosX, y: pgPosY, duration: 0.2, ease: 'power1.inOut' }, 'moveSceneStart+=0.25')
                .to(playground.scale, { x: 1, y: 1 }, '<')

        })

        // Уничтожить контейнер с щупальцами из-под корабля в конце
        this._timeline.call(() => {
            this._underShipTentaclesContainer.destroy()
            this._tentaclesUsuallContainer.destroy()
            this._animationTentacles.destroy()
        }, null, 'hitStart+=2.6')

        return skipable.wait(
            () => this._timeline.timeScale(speedMode(1, 1.4)).then(),
            () => this._timeline.timeScale(speedMode(1, 1.4)),
            () => this._timeline.progress(1)
        )

    }

    /** Получить имя анимации удара щупальцем
     * @param position - позиция удара на поле
     */
    protected _getAnimationName(position: number): string {

        const positionName = this._animationPositions.filter(pos => {
            if (pos.includes(position)) {
                return pos
            }
        })

        if (positionName.length > 0) {
            return ELogoAnimations.punch + positionName[0].join('_')
        }

        return ELogoAnimations.punch + position

    }

    /** Получить анимированный спрайт */
    protected _getTextures(assetName: string, animation: string): TPixiTextures {

        const asset = Assets.assets.get(assetName)
        const resource = Loaders.resources.get(asset.srcResource)
        const textures = resource.spritesheet.animations[animation].slice()

        resource.children.map(r => {
            if (r.spritesheet) {
                textures.push(...r.spritesheet.animations[animation])
            }
        })

        return textures
    }

    /** Сложение позиций
     * @param prevPos - изначальная позиция по X и Y
     * @param addPos - X и Y для добавления к prevPos
     */
    protected _addPositions(prevPos: TNumberArray, addPos: TNumberArray): TNumberArray {
        const config = borderView.isDesktop ? desktopConfig : borderView.isLandscape ? mobileLandscapeConfig : mobilePortraitConfig

        return [prevPos[0] + addPos[0] * config.cascadeScale, prevPos[1] + addPos[1] * config.cascadeScale]
    }
}
