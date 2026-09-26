import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../common/decorators/public.decorator';
import { isUuid } from '../../common/identifiers/uuid.util';
import { IServiceSafe } from '../../repositories/interfaces/services.repository';
import { ServicesService } from '../services/services.service';
import { ListInternalServicesQueryDto } from './dto/list-internal-services-query.dto';
import { InternalAuthGuard } from './guards/internal-auth.guard';

/**
 * Read-only catalog for saaspa-IA (Fase 1). It wraps the real ServicesService so
 * there is a single source of truth for the catalog.
 *
 * Contract: saaspa-IA/docs/contracts/internal-api.openapi.yaml.
 * @Public() only skips the user session guard; InternalAuthGuard is the real gate
 * and authorizes with the identity of the turn token.
 */
@ApiExcludeController()
@Controller('internal/v1/services')
@Public()
@SkipThrottle()
@UseGuards(InternalAuthGuard)
export class InternalServicesController {
  constructor(private servicesService: ServicesService) {}

  @Get()
  async list(@Query() query: ListInternalServicesQueryDto) {
    const result = await this.servicesService.findActive({
      page: query.page,
      limit: query.limit,
      featured: query.featured === 'true',
    });

    return { ...result, data: result.data.map((service) => this.toContractService(service)) };
  }

  @Get(':idOrSlug')
  async detail(@Param('idOrSlug') idOrSlug: string) {
    const service = isUuid(idOrSlug)
      ? await this.servicesService.findById(idOrSlug)
      : await this.servicesService.findBySlug(idOrSlug);

    return this.toContractService(service);
  }

  /**
   * The real repository exposes the relation as `categoryRel`; the internal
   * contract exposes it as `category`. Only the fields of the contract are
   * returned, so the payload does not drift from what saaspa-IA expects.
   */
  private toContractService(service: IServiceSafe) {
    return {
      id: service.id,
      name: service.name,
      slug: service.slug,
      description: service.description,
      price: service.price,
      compareAtPrice: service.compareAtPrice,
      duration: service.duration,
      isActive: service.isActive,
      isFeatured: service.isFeatured,
      categoryId: service.categoryId,
      category: service.categoryRel ?? null,
      imageUrl: service.imageUrl,
      mainImage: service.mainImage,
      carouselImages: service.carouselImages ?? null,
    };
  }
}
