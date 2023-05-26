import * as PIXI from 'pixi.js'
import Assets from '../../../framework/classes/assets.class'
import * as Short from '../../../framework/extends/short.types'
import AbstractComponent from '../../../framework/components/abstract.component'
import borderView from '../../configs/borderview'
import { TDeviceOrientationConfig } from '../../extends/short.types'
import { get } from '../../../framework/classes/di.class'
import Container from '../../../framework/classes/container.class'
import { TGsapTimeline } from '../../../framework/extends/short.types'
import { timelineCreate } from '../../../framework/functions/timeline/create.funcs'
import { ease } from '../../../framework/extends/enum.types'
import { sleep } from '../../../framework/functions/engine.funcs'
import { speedMode } from '../../../framework/functions/speed/mode.func'

type TPositionArray = [number, number]

type TAccumulationKrakenComponent = {
    backgroundScale: number,
    krakenImagePosition: TPositionArray,
    krakenSizePosition: TPositionArray,
    krakenAccumulationCenter: TPositionArray,
    krakenAccumulationItemsPadding: number
    krakenItemsCenter: TPositionArray,
    krakenItemsPadding: number
}

const AAssets = [
    'paper.png',
    'octopus-monochrome.png',
    'octopus-color.png',
    '3x3.png',
    '4x4.png',
    '5x5.png',
    'point-unactive.png',
    'point-kraken.png'
]

const assetsAccumulationKraken = 'accumulationKraken'

/**
 * Компонент накопления во Freespins (Ярость Кракена)
 */
export default class AccumulationKrakenComponent extends AbstractComponent {

    protected _background: PIXI.Sprite
    protected _krakenImageTransparent: PIXI.Sprite // Изображение Кракена на папирусе (прозрачное)
    protected _krakenImageColor: PIXI.Sprite

    protected _krakenSize = 0 // Текущий размер Кракена
    protected _krakenSizes: Array <PIXI.Sprite> = [] // Все возможные размеры

    protected _krakenAccumulationsContainer: Container
    protected _krakenAccumulations: Array <PIXI.Sprite> = [] // Массив элементов, отображающих количество Кракен-кругов
    protected _krakenAccumulationVariants = get('krakenScoreInterval', [4, 5, 6]) // Накопления для достижения Кракена

    protected _krakenItemsContainer: Container
    protected _krakenItems: Array <PIXI.Sprite> = [] // Кракен-круги
    protected _activeKrakenItems = 0 // Количество активных Kraken Circle

    protected _totalKrakenScore = 0

    protected _timeline: TGsapTimeline

    protected _configAdaptive: TDeviceOrientationConfig <TAccumulationKrakenComponent> = {
        desktop: {
            landscape: {
                backgroundScale: 1,
                krakenImagePosition: [140, 175],
                krakenSizePosition: [195, 280],
                krakenAccumulationCenter: [217, 366],
                krakenAccumulationItemsPadding: 35,
                krakenItemsCenter: [217, 366],
                krakenItemsPadding: 35
            }
        },
        mobile: {
            landscape: {
                backgroundScale: 1,
                krakenImagePosition: [83, 57],
                krakenSizePosition: [106, 104],
                krakenAccumulationCenter: [117, 146],
                krakenAccumulationItemsPadding: 19,
                krakenItemsCenter: [117, 146],
                krakenItemsPadding: 19
            },
            portrait: {
                backgroundScale: -1, // Зеркалим по горизонтали
                krakenImagePosition: [-152, 60],
                krakenSizePosition: [-129, 108],
                krakenAccumulationCenter: [-117, 145],
                krakenAccumulationItemsPadding: 19,
                krakenItemsCenter: [-117, 145],
                krakenItemsPadding: 19
            }
        }
    }

    /** @constructor */
    constructor(name = 'accumulation.kraken.component') {
        super(name)

        this.instance.visible = false
    }

    /** */
    async create(instance?: Short.TSupportContainer): Promise <this> {

        await super.create(instance)

        this._background = new PIXI.Sprite(Assets.getTexture(assetsAccumulationKraken, AAssets[0]))
        this._krakenImageTransparent = new PIXI.Sprite(Assets.getTexture(assetsAccumulationKraken, AAssets[1]))
        this._krakenImageColor = new PIXI.Sprite(Assets.getTexture(assetsAccumulationKraken, AAssets[2]))
        this._krakenImageColor.alpha = 0

        this._krakenSizes = [AAssets[3], AAssets[4], AAssets[5]].map((asset, idx) => {
            const krakenSize = new PIXI.Sprite(Assets.getTexture(assetsAccumulationKraken, asset))
            idx && (krakenSize.alpha = 0)

            return krakenSize
        })

        this._krakenAccumulationsContainer = new Container('accumulation.kraken.items')
        this._krakenItemsContainer = new Container('kraken.items')

        this.instance.addChild(this._background, this._krakenImageTransparent, this._krakenImageColor, ...this._krakenSizes)
        this._getActualKrakenAccumulation()

        this.draw()

        return this
    }

    /** @destroy */
    async destroy(): Promise <this> {

        await Promise.all([
            this._background.destroy(),
            this._krakenImageTransparent.destroy(),
            this._krakenImageColor.destroy(),
            ...this._krakenSizes.map(size => size.destroy()),
            ...this._krakenItems.map(item => item.destroy()),
            ...this._krakenAccumulations.map(accum => accum.destroy()),
            this._krakenAccumulationsContainer.destroy(),
            this._krakenItemsContainer.destroy(),
            this._timeline.destroy()
        ])

        this._timeline = null

        return this
    }

    /** */
    async draw(): Promise <this> {

        const config = this._configAdaptive[borderView.device][borderView.orientation]

        this._background.scale.x = config.backgroundScale

        this._krakenImageTransparent.position.set(...config.krakenImagePosition)
        this._krakenImageColor.position.set(...config.krakenImagePosition)

        this._krakenSizes.forEach(krakenSize => {
            krakenSize.position.set(...config.krakenSizePosition)
        })

        this._krakenAccumulationsContainer.position.set(...config.krakenAccumulationCenter)
        this._krakenItemsContainer.position.set(...config.krakenItemsCenter)

        return this
    }

    /** Получить Kraken Circles в нужном количестве и в правильных позициях
     * @param start - начало freespins
     * @param reset - сброс до начального отображения?
     */
    protected _getActualKrakenAccumulation(start = true, reset = false): void {

        const krakenAccumulation = this._krakenAccumulationVariants[this._krakenSize]

        // Инициализация накопления
        if (start) {
            this._krakenAccumulations = []

            for (let i = 0; i < krakenAccumulation; i ++) {
                this._krakenAccumulations.push(new PIXI.Sprite(Assets.getTexture(assetsAccumulationKraken, AAssets[6])))

                const krakenItem = new PIXI.Sprite(Assets.getTexture(assetsAccumulationKraken, AAssets[7]))
                this._krakenItems.push(krakenItem)
                krakenItem.alpha = 0
            }

            this._krakenAccumulationPositions()

            return
        }

        // При изменении размера Кракена
        const prevAccum = reset
            ? this._krakenAccumulationVariants[this._krakenAccumulationVariants.length - 1]
            : this._krakenAccumulationVariants[this._krakenSize - 1]

        if (krakenAccumulation > prevAccum) {
            for (let i = prevAccum; i < krakenAccumulation; i ++) {
                const krakenAccum = new PIXI.Sprite(Assets.getTexture(assetsAccumulationKraken, AAssets[6]))
                this._krakenAccumulations.push(krakenAccum)
                krakenAccum.alpha = 0

                const krakenItem = new PIXI.Sprite(Assets.getTexture(assetsAccumulationKraken, AAssets[7]))
                this._krakenItems.push(krakenItem)
                krakenItem.alpha = 0
            }

            this._krakenAccumulationPositions(true)

        } else if (krakenAccumulation < prevAccum) {
            const extraAccumCircles = this._krakenAccumulations.slice(krakenAccumulation)
            this._krakenAccumulations.splice(krakenAccumulation)

            const extraKrakenCircles = this._krakenItems.slice(krakenAccumulation)
            this._krakenItems.splice(krakenAccumulation)

            this._krakenAccumulationPositions(true, extraAccumCircles, extraKrakenCircles)
        }
    }

    /** Передвигаем Kraken Circles в завиcимости от их количества
     * @param newPivotX - координата pivot по оси X
     */
    protected async _moveKrakenCirclesContainer(container: Container, newPivotX: number): Promise <void> {

        this._timeline = timelineCreate()
            .to(container.pivot, { x: newPivotX, y: container.pivot.y, duration: 0.8, ease: ease.out }, 0)

        this._timeline.totalDuration() && await this._timeline.then()
        this._timeline.kill()
    }

    /** Показываем Kraken Accumulation */
    protected async _showKrakenAccumulation(): Promise <void> {

        this._timeline = timelineCreate()

        this._krakenAccumulations.forEach((krakenAccumulation) => {
            this._timeline.to(krakenAccumulation, { alpha: 1, duration: 0.8, ease: ease.out }, 0)
        })

        this._timeline.totalDuration() && await this._timeline.then()
        this._timeline.kill()
    }

    /** Скрываем лишние Kraken Accumulation/Items
     * @param extraAccumCircles - лишние Kraken Accumulations
     * @param extraKrakenCircless - лишние Kraken Items
     */
    protected async _hideExtraKrakenAccumulation(extraAccumCircles: Array <PIXI.Sprite>, extraKrakenCircless: Array <PIXI.Sprite>): Promise <void> {

        this._timeline = timelineCreate()

        const sprites = [...extraAccumCircles, ...extraKrakenCircless]
        this._timeline
            .to(sprites, { alpha: 0, duration: 0.5, ease: ease.in }, 0)
            .call(() => sprites.map(v => v.destroy()), null, 0.5)

        this._timeline.totalDuration() && await this._timeline.then()
        this._timeline.kill()
    }

    /** Позиции для Kraken Accumulations/Items (круги для маленьких Кракенов)
     * @param move - нужно ли двигать Kraken Circles?
     * @param extraAccumCircles - point-unactive.png для удаления
     * @param extraKrakenCircles - point-kraken.png для удаления
     */
    protected async _krakenAccumulationPositions(move = false, extraAccumCircles: Array <PIXI.Sprite> = [], extraKrakenCircles: Array <PIXI.Sprite> = []): Promise <void> {

        const config = this._configAdaptive[borderView.device][borderView.orientation]

        // Позиции для Accumulation-кругов
        this._setPositions(this._krakenAccumulations, config.krakenAccumulationItemsPadding, this._krakenAccumulationsContainer)

        // Позиции для Kraken-кругов
        this._setPositions(this._krakenItems, config.krakenItemsPadding, this._krakenItemsContainer)

        // Движение Kraken Accumulation и Items + центрирование pivot
        if (move) {
            extraAccumCircles.length && extraKrakenCircles.length
                ? await this._hideExtraKrakenAccumulation(extraAccumCircles, extraKrakenCircles)
                : this._showKrakenAccumulation()

            this._moveKrakenCirclesContainer(this._krakenAccumulationsContainer, this._krakenAccumulationsContainer.width / 2)
            this._moveKrakenCirclesContainer(this._krakenItemsContainer, this._krakenItemsContainer.width / 2)

        } else {
            this._krakenAccumulationsContainer.setCenterPivot()
            this._krakenItemsContainer.setCenterPivot()
        }

        this.instance.addChild(this._krakenAccumulationsContainer, this._krakenItemsContainer)
    }

    /** Установка позиций со сдвигом по X
     * @param enumerated - перебираемый массив pixi-элементов
     * @param xOffset - отступ по X
     */
    protected _setPositions(enumerated: Array <PIXI.Sprite>, xOffset: number, container: Container): void {
        let [xPos, yPos] = [0, 0]

        enumerated.forEach((accumItem, idx) => {
            idx && (xPos += xOffset) // Двигаем по X координате
            accumItem.position.set(xPos, yPos)

            container.addChild(accumItem)
        })
    }

    /** Активация Kraken Items
     * @param totalKrakenScore - количество Kraken Items, которые должны быть активированы (с учётом использованных)
     */
    async activateKrakenItems(totalKrakenScore: number): Promise <void> {

        const currentStepKrakenScore = this._krakenSize
            ? totalKrakenScore - this._krakenAccumulationVariants.slice(0, this._krakenSize).reduce((a, b) => a + b)
            : totalKrakenScore

        const circleKrakenAmount = this._krakenAccumulationVariants[this._krakenSize]

        this._timeline = timelineCreate()

        for (let i = this._activeKrakenItems; i < currentStepKrakenScore; i ++) {
            if (this._activeKrakenItems === circleKrakenAmount) break

            this._timeline.to(this._krakenItems[this._activeKrakenItems], { alpha: 1, duration: 0.25, ease: ease.out }, 0)
            this._activeKrakenItems += 1
        }

        // Активация изображения Кракена
        if (this._activeKrakenItems === circleKrakenAmount) {
            this._timeline
                .to(this._krakenImageColor, { alpha: 1, duration: 0.5, ease: ease.out }, 0)
        }

        // Озвучка анимации большого Кракена
        if (this._totalKrakenScore < totalKrakenScore) {
            this._timeline.call(() => {
                this.emit('sounds:play', { name: 'kraken_collect' })
                this._totalKrakenScore = totalKrakenScore
            }, null, speedMode(0.1, 0))
        }

        this._timeline.totalDuration() && await this._timeline.then()
        this._timeline.kill()
    }

    /** Смена Kraken (image и все круги)
     * @param reset - сброс до начального отображения?
     */
    async changeKrakenAccumulation(reset: boolean, totalKrakenScore?: number): Promise <void> {

        await sleep(speedMode(600, 700))

        reset
            ? this._krakenSize = 0
            : this._krakenSize += 1

        if (this._krakenSize > this._krakenAccumulationVariants.length - 1) return

        this._timeline = timelineCreate()
            .to(this._krakenImageColor, { alpha: 0, duration: 0.4, ease: ease.in }, 0)
            .call(async () => {
                this._getActualKrakenAccumulation(false, reset)
                await sleep(200)
                await this.deactivateKrakenItems()
            }, null, 0)

        this._krakenSizes.forEach((krakenSize, idx) => {
            const alpha = idx === this._krakenSize ? 1 : 0
            this._timeline.to(krakenSize, { alpha, duration: 0.5, ease: ease.in }, 0)
        })

        reset
            ? this._timeline.to(this._krakenSizes[this._krakenSizes.length - 1], { alpha: 0, duration: 0.4, ease: ease.in }, 0)
            : this._timeline.to(this._krakenSizes[this._krakenSize - 1], { alpha: 0, duration: 0.4, ease: ease.in }, 0)

        this._timeline.totalDuration() && await this._timeline.then()
        this._timeline.kill()

        if (totalKrakenScore) {
            await sleep(speedMode(450, 500))
            this.activateKrakenItems(totalKrakenScore)
        }
    }

    /** Деактивация Kraken Items (все круги) */
    async deactivateKrakenItems(): Promise <void> {

        this._activeKrakenItems = 0

        this._timeline = timelineCreate()
            .to(this._krakenItems, { alpha: 0, duration: 0.25, ease: ease.in }, 0)

        this._timeline.totalDuration() && await this._timeline.then()
        this._timeline.kill()
    }
}
