const { AuthenticationError, ForbiddenError } = require('@apollo/server');
const authErrMessage = '*** you must be logged in ***';

const resolvers = {
  Query: {
    searchListings: async (_, { criteria }, { dataSources }) => {
      const { numOfBeds, checkInDate, checkOutDate, page, limit, sortBy } = criteria;
      const listings = await dataSources.listingsAPI.getListings({ numOfBeds, page, limit, sortBy });

      // check availability for each listing
      const listingAvailability = await Promise.all(
        listings.map((listing) =>
          dataSources.bookingsDb.isListingAvailable({ listingId: listing.id, checkInDate, checkOutDate })
        )
      );

      // filter listings data based on availability
      const availableListings = listings.filter((listing, index) => listingAvailability[index]);

      return availableListings;
    },
    hostListings: async (_, __, { dataSources, userId, userRole }) => {
      if (!userId) throw new AuthenticationError(authErrMessage);

      if (userRole === 'Host') {
        return dataSources.listingsAPI.getListingsForUser(userId);
      } else {
        throw new ForbiddenError('Only hosts have access to listings.');
      }
    },
    listing: (_, { id }, { dataSources }) => {
      return dataSources.listingsAPI.getListing(id);
    },
    featuredListings: (_, __, { dataSources }) => {
      const limit = 3;
      return dataSources.listingsAPI.getFeaturedListings(limit);
    },
    listingAmenities: (_, __, { dataSources }) => {
      return dataSources.listingsAPI.getAllAmenities();
    }
  },
  Mutation: {
    createListing: async (_, { listing }, { dataSources, userId, userRole }) => {
      if (!userId) throw new AuthenticationError(authErrMessage);

      const { title, description, photoThumbnail, numOfBeds, costPerNight, locationType, amenities } = listing;

      if (userRole === 'Host') {
        try {
          const newListing = await dataSources.listingsAPI.createListing({
            title,
            description,
            photoThumbnail,
            numOfBeds,
            costPerNight,
            hostId: userId,
            locationType,
            amenities,
          });

          return {
            code: 200,
            success: true,
            message: 'Listing successfully created!',
            listing: newListing,
          };
        } catch (err) {
          return {
            code: 400,
            success: false,
            message: err.message,
          };
        }
      } else {
        return {
          code: 400,
          success: false,
          message: 'Only hosts can create new listings',
        };
      }
    },
    updateListing: async (_, { listingId, listing }, { dataSources, userId }) => {
      if (!userId) throw new AuthenticationError(authErrMessage);

      try {
        const updatedListing = await dataSources.listingsAPI.updateListing({ listingId, listing });

        return {
          code: 200,
          success: true,
          message: 'Listing successfully updated!',
          listing: updatedListing,
        };
      } catch (err) {
        return {
          code: 400,
          success: false,
          message: err.message,
        };
      }
    },
  },
  Listing: {
    host: ({ hostId }) => {
      return { id: hostId };
    },
    totalCost: async ({ id }, { checkInDate, checkOutDate }, { dataSources }) => {
      const { totalCost } = await dataSources.listingsAPI.getTotalCost({ id, checkInDate, checkOutDate });
      return totalCost;
    },
  },
  Booking: {
    listing: async (parent, _, { dataSources }) => {
      const data = await dataSources.bookingsDb.getBooking(parent.id);
      return dataSources.listingsAPI.getListing(data.listingId);
    },
    totalPrice: async (parent, _, { dataSources }) => {
      const { listingId, checkInDate, checkOutDate } = await dataSources.bookingsDb.getBooking(parent.id);

      const { totalCost } = await dataSources.listingsAPI.getTotalCost({ id: listingId, checkInDate, checkOutDate });
      return totalCost;
    },
  },
  AmenityCategory: {
    ACCOMMODATION_DETAILS: 'Accommodation Details',
    SPACE_SURVIVAL: 'Space Survival',
    OUTDOORS: 'Outdoors',
  },
};

module.exports = resolvers;